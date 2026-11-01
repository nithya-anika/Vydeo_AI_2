/**
 * Local FFmpeg rendering.
 * Used when GCS_BUCKET / Cloud Transcoder is not configured.
 */

import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";

import type {
  RenderCaption,
  RenderParams,
} from "./transcoder";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type FfmpegRenderResult = {
  downloadUrl: string;
  filename: string;
  outputPath: string;
};

/* -------------------------------------------------------------------------- */
/* FFmpeg & System Font Detection                                            */
/* -------------------------------------------------------------------------- */

export function escapeFontPathForFfmpeg(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export function findSystemFont(requestedFontFamily?: string): string | null {
  const fontCandidates = [
    // 0. Explicit requested font lookup mapping
    ...(requestedFontFamily?.toLowerCase().includes("playfair") ? [
      path.join(process.cwd(), "public/fonts/PlayfairDisplay-Regular.ttf"),
      "/usr/share/fonts/truetype/playfair/PlayfairDisplay-Regular.ttf",
    ] : []),
    ...(requestedFontFamily?.toLowerCase().includes("space") ? [
      path.join(process.cwd(), "public/fonts/SpaceGrotesk-Regular.ttf"),
      "/usr/share/fonts/truetype/space/SpaceGrotesk-Regular.ttf",
    ] : []),

    // 1. Bundled production repository font (always present in app / container)
    path.join(process.cwd(), "public/fonts/Geist-Regular.ttf"),
    path.join(process.cwd(), "app/public/fonts/Geist-Regular.ttf"),
    path.join(__dirname, "../../../public/fonts/Geist-Regular.ttf"),

    // 2. Production container / Linux paths (Debian/Ubuntu/Alpine)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",

    // 3. macOS local dev paths
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",

    // 4. Windows paths
    "C:/Windows/Fonts/arial.ttf",
  ];

  for (const candidate of fontCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function findFfmpeg(): string {
  // 1. Prioritize modern system FFmpeg builds (Ubuntu EC2 / Debian / Homebrew) with xfade & libass
  const candidates = [
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // 2. Check if ffmpeg is in PATH
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("child_process");
    const whichPath = execSync("which ffmpeg", { encoding: "utf8" }).trim();
    if (whichPath && existsSync(whichPath)) {
      return whichPath;
    }
  } catch {
    // Ignore
  }

  // 3. Fallback to bundled installer if no system ffmpeg is installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require("@ffmpeg-installer/ffmpeg");
    if (installer?.path && existsSync(installer.path)) {
      return installer.path;
    }
  } catch {
    // Fall back to system paths
  }

  return "ffmpeg";
}

function runFfmpeg(
  args: string[]
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      const bin = findFfmpeg();
      
      // Inject thread limit at the start of inputs to keep memory footprint tiny on 2GB servers
      const optimizedArgs = ["-threads", "1", ...args];

      console.log(
        "[FFmpeg]",
        bin,
        optimizedArgs.join(" ")
      );

      const proc = spawn(
        bin,
        optimizedArgs,
        {
          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        }
      );

      let stderr = "";

      proc.stderr?.on(
        "data",
        (data: Buffer) => {
          stderr += data.toString();
        }
      );

      proc.on(
        "close",
        (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          if (stderr.includes("No such filter: 'drawtext'") || stderr.includes("No font filename provided")) {
            console.error("[FFmpeg Caption Error] Requested captions failed to render:", stderr);
            reject(
              new Error(
                `Caption rendering failed: FFmpeg was unable to render requested captions (${stderr.slice(-400).trim()}). Requested text was NOT silently dropped. Ensure an FFmpeg binary with libfreetype support and system fonts are installed.`
              )
            );
            return;
          }

          console.error(
            "[FFmpeg Error]",
            stderr
          );

          reject(
            new Error(
              `FFmpeg exited ${code}: ${stderr.slice(
                -2000
              )}`
            )
          );
        }
      );

      proc.on(
        "error",
        (error) => {
          reject(
            new Error(
              `FFmpeg spawn: ${error.message}`
            )
          );
        }
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Data URL helpers                                                           */
/* -------------------------------------------------------------------------- */

function dataUrlExt(
  dataUrl: string,
  fallback: string
): string {
  const mime =
    dataUrl
      .match(
        /^data:([^;,]+)/
      )?.[1]
      ?.toLowerCase() ?? "";

  /* Images */

  if (mime === "image/png") {
    return "png";
  }

  if (mime === "image/webp") {
    return "webp";
  }

  if (mime === "image/gif") {
    return "gif";
  }

  if (
    mime === "image/jpeg" ||
    mime === "image/jpg"
  ) {
    return "jpg";
  }

  /* Videos */

  if (mime === "video/mp4") {
    return "mp4";
  }

  if (mime === "video/webm") {
    return "webm";
  }

  if (
    mime === "video/quicktime"
  ) {
    return "mov";
  }

  if (mime === "video/mpeg") {
    return "mpg";
  }

  /* Audio */

  if (mime === "audio/mpeg") {
    return "mp3";
  }

  if (
    mime === "audio/wav" ||
    mime === "audio/x-wav"
  ) {
    return "wav";
  }

  if (mime === "audio/ogg") {
    return "ogg";
  }

  if (
    mime === "audio/mp4" ||
    mime === "audio/x-m4a"
  ) {
    return "m4a";
  }

  /*
   * Sanitize fallback.
   * Prevent extensions such as ".15".
   */

  const cleanFallback = (
    fallback || ""
  )
    .replace(/^\./, "")
    .toLowerCase();

  const allowed =
    new Set([
      "mp4",
      "mov",
      "webm",
      "mpg",
      "mpeg",
      "jpg",
      "jpeg",
      "png",
      "webp",
      "gif",
      "mp3",
      "wav",
      "ogg",
      "m4a",
    ]);

  if (
    allowed.has(
      cleanFallback
    )
  ) {
    return cleanFallback;
  }

  /* MIME category fallback */

  if (
    mime.startsWith(
      "image/"
    )
  ) {
    return "jpg";
  }

  if (
    mime.startsWith(
      "audio/"
    )
  ) {
    return "m4a";
  }

  return "mp4";
}

import https from 'https';
import http from 'http';
import fs from 'fs';

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}. HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(outputPath, buffer);
}

async function fetchMediaDataUrl(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not fetch render media from ${url}. HTTP ${response.status}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error(`Remote media URL returned an empty file: ${url}`);
  }

  const contentType =
    response.headers.get("content-type") ||
    (url.match(/\.(png|jpg|jpeg|webp|gif|mp4|webm|mov|m4a)$/i)
      ? "application/octet-stream"
      : "application/octet-stream");

  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function saveBase64(
  dataUrl: string,
  fallbackExt: string,
  dir: string
): Promise<string> {
  /*
   * This renderer expects:
   *
   * data:video/mp4;base64,...
   * data:image/jpeg;base64,...
   */

  if (
    !dataUrl.startsWith(
      "data:"
    )
  ) {
    throw new Error(
      `Invalid media input. Expected base64 data URL but received: ${dataUrl.slice(
        0,
        60
      )}`
    );
  }

  const separator =
    dataUrl.indexOf(",");

  if (
    separator === -1
  ) {
    throw new Error(
      "Invalid base64 data URL: missing comma."
    );
  }

  const header =
    dataUrl.slice(
      0,
      separator
    );

  if (
    !header.includes(
      ";base64"
    )
  ) {
    throw new Error(
      "Media data URL is not base64 encoded."
    );
  }

  const base64 =
    dataUrl.slice(
      separator + 1
    );

  if (!base64) {
    throw new Error(
      "Media base64 data is empty."
    );
  }

  const buffer =
    Buffer.from(
      base64,
      "base64"
    );

  if (
    buffer.length === 0
  ) {
    throw new Error(
      "Decoded media file is empty."
    );
  }

  const actualExt =
    dataUrlExt(
      dataUrl,
      fallbackExt
    );

  const file =
    path.join(
      dir,
      `${uuidv4()}.${actualExt}`
    );

  await writeFile(
    file,
    buffer
  );

  console.log(
    "[FFmpeg Media]",
    {
      file,
      extension:
        actualExt,
      size:
        buffer.length,
      mime:
        header.slice(
          0,
          100
        ),
    }
  );

  return file;
}

/* -------------------------------------------------------------------------- */
/* Colors / captions                                                          */
/* -------------------------------------------------------------------------- */

function normalizeHexColor(
  value:
    | string
    | undefined,
  fallback: string
): string {
  const raw = (
    value ?? ""
  ).trim();

  const hex =
    raw.startsWith("#")
      ? raw.slice(1)
      : raw;

  return /^[0-9a-f]{6}$/i.test(
    hex
  )
    ? hex.toUpperCase()
    : fallback;
}

function escapeDrawtext(
  value: string
): string {
  return value
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /'/g,
      "\\'"
    )
    .replace(
      /:/g,
      "\\:"
    )
    .replace(
      /\[/g,
      "\\["
    )
    .replace(
      /\]/g,
      "\\]"
    )
    .replace(
      /%/g,
      "\\%"
    );
}

function captionToFilter(
  caption:
    RenderCaption,
  width: number,
  height: number
): string | null {
  const text =
    caption.text?.trim();

  const start =
    Math.max(
      0,
      Number(
        caption.startTime
      )
    );

  const end =
    Math.max(
      start + 0.1,
      Number(
        caption.endTime
      )
    );

  if (
    !text ||
    !Number.isFinite(
      start
    ) ||
    !Number.isFinite(
      end
    )
  ) {
    return null;
  }

  const fontSize =
    Math.max(
      18,
      Math.min(
        96,
        Math.round(
          caption.fontSize ??
            34
        )
      )
    );

  const color =
    normalizeHexColor(
      caption.color,
      "FFFFFF"
    );

  const boxColor =
    normalizeHexColor(
      caption.bgColor,
      "000000"
    );

  const boxOpacity =
    Math.max(
      0,
      Math.min(
        1,
        caption.bgOpacity ??
          0.48
      )
    );

  const xPct =
    Math.max(
      5,
      Math.min(
        95,
        caption.x ?? 50
      )
    ) / 100;

  const yPct =
    Math.max(
      5,
      Math.min(
        95,
        caption.y ?? 84
      )
    ) / 100;

  const yPx =
    Math.round(
      height * yPct
    );

  const weight =
    caption.bold
      ? ":font='Inter:style=Bold'"
      : "";

  const fontPath = findSystemFont(caption.fontFamily);
  const fontArg = fontPath ? `:fontfile='${escapeFontPathForFfmpeg(fontPath)}'` : "";

  return [
    "drawtext=",

    `text='${escapeDrawtext(
      text
    )}'`,

    fontArg,

    weight,

    `:x='${Math.round(
      width * xPct
    )}-text_w/2'`,

    `:y='${yPx}-text_h/2'`,

    `:fontsize=${fontSize}`,

    `:fontcolor=${color}`,

    `:box=1:boxcolor=${boxColor}@${boxOpacity.toFixed(
      2
    )}:boxborderw=18`,

    ":line_spacing=6",

    `:enable='between(t,${start.toFixed(
      3
    )},${end.toFixed(
      3
    )})'`,
  ].join("");
}

/* -------------------------------------------------------------------------- */
/* Dimensions                                                                 */
/* -------------------------------------------------------------------------- */

export function ratioDimensions(
  ratio: string,
  resolution: string = "1080p"
): [number, number] {
  let base = 1080;
  if (resolution === "720p") base = 720;
  else if (resolution === "1080p") base = 1080;
  else if (resolution === "1440p") base = 1440;
  else if (resolution === "2160p") base = 2160;

  const makeEven = (n: number) => Math.round(n / 2) * 2;

  switch (ratio) {
    case "16:9":
      return [makeEven(base * 16 / 9), base];
    case "1:1":
      return [base, base];
    case "4:5":
      return [base, makeEven(base * 5 / 4)];
    case "3:4":
      return [base, makeEven(base * 4 / 3)];
    default:
      return [base, makeEven(base * 16 / 9)];
  }
}

/* -------------------------------------------------------------------------- */
/* Visual effects                                                             */
/* -------------------------------------------------------------------------- */

export function effectToVfFilter(
  effect: string
): string {
  const e = effect.toLowerCase();

  // Handle exact LUT presets from the UI
  if (
    e.includes("black & white") ||
    e.includes("black and white") ||
    e.includes("black-and-white") ||
    e.includes("grayscale") ||
    e.includes("bw")
  ) {
    return "hue=s=0";
  }
  if (e.includes("vintage") || e.includes("sepia")) {
    return "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131";
  }
  if (e.includes("warm") || e.includes("golden")) {
    return "colorbalance=rs=0.15:gs=0.05:bs=-0.15";
  }
  if (e.includes("cool")) {
    return "colorbalance=rs=-0.1:gs=0:bs=0.2";
  }
  if (e.includes("neon")) {
    return "eq=saturation=2:brightness=0.1:contrast=1.2";
  }
  if (e.includes("teal")) {
    // Teal and orange simplified
    return "colorbalance=rs=0.15:bs=-0.15,eq=saturation=1.2:contrast=1.1";
  }
  if (e.includes("desaturat")) {
    return "eq=saturation=0.2:contrast=1.05";
  }
  if (e.includes("cinematic") || e.includes("film")) {
    return "curves=preset=strong_contrast,colorbalance=rs=0.05:bs=-0.05";
  }

  // Handle generative / arbitrary effects
  if (e.includes("vignette")) return "vignette=angle=PI/4:mode=forward";
  if (e.includes("blur") || e.includes("dreamy")) return "boxblur=3:1";
  if (e.includes("sharpen") || e.includes("crisp")) return "unsharp=5:5:1.5:5:5:0.0";
  if (e.includes("matte") || e.includes("fade")) return "curves=preset=lighter,eq=contrast=0.85:saturation=0.8";
  if (e.includes("vibrant") || e.includes("pop")) return "eq=saturation=1.4:contrast=1.1";
  if (e.includes("moody") || e.includes("dark")) return "eq=brightness=-0.05:contrast=1.15:saturation=0.85";
  if (e.includes("bright") || e.includes("light")) return "eq=brightness=0.08:contrast=0.95";

  return "";
}

/* -------------------------------------------------------------------------- */
/* Audio speed                                                                */
/* -------------------------------------------------------------------------- */

export function buildAtempoChain(
  speed: number
): string {
  const filters:
    string[] = [];

  let rate = speed;

  while (
    rate >
    2.0 + 1e-6
  ) {
    filters.push(
      "atempo=2.0"
    );

    rate /= 2;
  }

  while (
    rate <
    0.5 - 1e-6
  ) {
    filters.push(
      "atempo=0.5"
    );

    rate /= 0.5;
  }

  filters.push(
    `atempo=${rate.toFixed(
      6
    )}`
  );

  return filters.join(
    ","
  );
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                */
/* -------------------------------------------------------------------------- */

export function toXfadeType(
  type: string
): string {
  switch (type) {
    case "fade":
    case "cinematic-fade":
      return "fade";

    case "dissolve":
      return "dissolve";

    case "wipe-left":
      return "wipeleft";

    case "wipe-right":
      return "wiperight";

    case "slide-left":
      return "slideleft";

    case "slide-right":
      return "slideright";

    case "zoom-in":
      return "zoomin";

    case "zoom-out":
      return "fadefast";

    default:
      return "";
  }
}

/* -------------------------------------------------------------------------- */
/* Main renderer                                                              */
/* -------------------------------------------------------------------------- */

export async function renderWithFfmpeg(
  params: RenderParams,
  onProgress?: (progress: number) => void
): Promise<FfmpegRenderResult> {
  const {
    scenes,
    audio,
    brand,
    aspectRatio = "9:16",
    outputFilename,
  } = params;

  const tmpDir =
    path.join(
      "/var/tmp",
      "ai-video-renders",
      uuidv4()
    );

  const outDir =
    path.join(
      tmpDir,
      "output"
    );

  const outFile =
    outputFilename ??
    `render-${uuidv4()}.mp4`;

  const outPath =
    path.join(
      outDir,
      outFile
    );

  await mkdir(
    tmpDir,
    {
      recursive: true,
    }
  );

  await mkdir(
    outDir,
    {
      recursive: true,
    }
  );

  const [W, H] =
    ratioDimensions(
      aspectRatio,
      params.resolution
    );

  const tempFiles:
    string[] = [];

  try {
    /* ---------------------------------------------------------------------- */
    /* Check transitions                                                      */
    /* ---------------------------------------------------------------------- */

    const useXfade =
      scenes.some(
        (
          scene,
          index
        ) =>
          index <
            scenes.length -
              1 &&
          scene.transition &&
          toXfadeType(
            scene
              .transition
              .type
          ) !== ""
      );

    /* ---------------------------------------------------------------------- */
    /* Check brand assets                                                     */
    /* ---------------------------------------------------------------------- */
    let logoFile = "";
    if (brand?.logoData) {
      if (brand.logoData.startsWith("data:")) {
        logoFile = await saveBase64(brand.logoData, "png", tmpDir);
        tempFiles.push(logoFile);
      } else if (brand.logoData.startsWith("http://") || brand.logoData.startsWith("https://")) {
        logoFile = path.join(tmpDir, `logo-${uuidv4()}.png`);
        await downloadFile(brand.logoData, logoFile);
        tempFiles.push(logoFile);
      }
    }

    /* ---------------------------------------------------------------------- */
    /* Prepare clips                                                          */
    /* ---------------------------------------------------------------------- */

    const scaledFiles: {
      file: string;
      displayDuration: number;
      xfadeType: string;
      xfadeDur: number;
    }[] = [];

    for (
      let si = 0;
      si <
      scenes.length;
      si++
    ) {
      if (onProgress) {
        const pct = Math.round((si / scenes.length) * 80);
        onProgress(pct);
      }
      const scene =
        scenes[si];

      const isLast =
        si ===
        scenes.length -
          1;

      const speed =
        scene.playbackSpeed ??
        (scene as any).playbackRate ??
        1;

      const transition =
        scene.transition;

      const xfadeType =
        isLast
          ? ""
          : transition
            ? toXfadeType(
                transition.type
              )
            : "";

      const xfadeDur =
        isLast
          ? 0
          : xfadeType
            ? transition
                ?.duration ??
              0.5
            : 0;

      const overlapSec =
        useXfade &&
        !isLast &&
        xfadeType
          ? xfadeDur
          : 0;

      const displayDur =
        scene.duration;

      const fileDur =
        displayDur +
        overlapSec;

      /* -------------------------------------------------------------------- */
      /* Placeholder                                                          */
      /* -------------------------------------------------------------------- */

      if (
        !scene.clipData && !scene.clipSrc
      ) {
        const placeholder =
          path.join(
            tmpDir,
            `ph-${scene.id}.mp4`
          );

        tempFiles.push(
          placeholder
        );

        await runFfmpeg([
          "-f",
          "lavfi",

          "-i",
          `color=c=black:s=${W}x${H}:d=${fileDur}:r=30`,

          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",

          "-t",
          String(
            fileDur
          ),

          "-pix_fmt",
          "yuv420p",

          "-y",
          placeholder,
        ]);

        scaledFiles.push(
          {
            file:
              placeholder,

            displayDuration:
              displayDur,

            xfadeType,

            xfadeDur,
          }
        );

        continue;
      }

      /* -------------------------------------------------------------------- */
      /* Debug media input                                                    */
      /* -------------------------------------------------------------------- */

      console.log(
        "[FFmpeg Scene]",
        {
          id: scene.id,

          clipType:
            scene.clipType,

          clipExt:
            scene.clipExt,

          dataPrefix:
            scene.clipData?.slice(
              0,
              100
            ) ?? "",
        }
      );

      /*
       * IMPORTANT:
       * Do NOT trust scene.clipExt.
       *
       * Your previous request produced clipExt = "15",
       * resulting in uuid.15.
       *
       * We instead use clipType as the fallback and let
       * saveBase64 detect the actual MIME type.
       */

      // Fix: the frontend often sends images marked as clipType: "video".
      // We must guess if it is an image based on the URL or data prefix.
      let actualClipType = scene.clipType ?? "video";
      if (scene.clipSrc && scene.clipSrc.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
        actualClipType = "image";
      }
      if (scene.clipData && scene.clipData.match(/^data:image\//i)) {
        actualClipType = "image";
      }

      const fallbackExt = actualClipType === "image" ? "jpg" : "mp4";

      let raw = "";

      if (scene.clipData && scene.clipData.startsWith("data:")) {
         raw = await saveBase64(
            scene.clipData,
            fallbackExt,
            tmpDir
          );
          tempFiles.push(raw);
      } else if (scene.clipSrc && scene.clipSrc.startsWith("local://")) {
         // Direct file path on the EC2 server SSD
         raw = scene.clipSrc.replace("local://", "");
         console.log(`[Export] Using local EC2 media directly: ${raw}`);
      } else if (scene.clipSrc) {
         raw = path.join(tmpDir, `${uuidv4()}.${fallbackExt}`);
         console.log(`[Export] Downloading remote media directly to disk: ${scene.clipSrc}`);
         await downloadFile(scene.clipSrc, raw);
         tempFiles.push(raw);
      }

      if (!raw || !existsSync(raw)) {
        const placeholder =
          path.join(
            tmpDir,
            `ph-${scene.id}.mp4`
          );

        tempFiles.push(placeholder);

        await runFfmpeg([
          "-f",
          "lavfi",
          "-i",
          `color=c=black:s=${W}x${H}:d=${fileDur}:r=30`,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-t",
          String(fileDur),
          "-pix_fmt",
          "yuv420p",
          "-y",
          placeholder,
        ]);

        scaledFiles.push({
          file: placeholder,
          displayDuration: displayDur,
          xfadeType,
          xfadeDur,
        });

        continue;
      }

      const scaled =
        path.join(
          tmpDir,
          `sc-${si}-${scene.id}.mp4`
        );

      tempFiles.push(
        scaled
      );

      /* -------------------------------------------------------------------- */
      /* Filters                                                              */
      /* -------------------------------------------------------------------- */

      const isCover = (scene as any).clipFit === "cover";
      const scaleFilter = isCover
        ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,settb=1/90000,format=yuv420p`
        : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,settb=1/90000,format=yuv420p`;

      const fpsFilter = "fps=30";

      const speedFilter =
        speed !== 1
          ? `setpts=${(
              1 / speed
            ).toFixed(
              6
            )}*PTS`
          : "";

      let eqFilter = "";
      if (scene.colorAdjustments) {
        const a = scene.colorAdjustments;
        const brightness = a.exposure || 0;
        const contrast = 1 + (a.contrast || 0) / 100;
        const saturation = 1 + (a.saturation || 0) / 100;
        if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
            eqFilter = "eq=brightness=" + brightness + ":contrast=" + contrast + ":saturation=" + saturation;
        }
      }
      
      const gradeFilter = scene.colorGrade ? effectToVfFilter(scene.colorGrade) : "";
      const effectFilter = [scene.visualEffect ? effectToVfFilter(scene.visualEffect) : "", gradeFilter, eqFilter].filter(Boolean).join(",");

      const captionFilters = (scene.captions || []).map(c => captionToFilter({ ...c, fontFamily: c.fontFamily || brand?.fontFamily, color: c.color || brand?.primaryColor }, W, H)).filter(Boolean).join(",");

      const vf = [
        scaleFilter,
        fpsFilter,
        speedFilter,
        effectFilter,
        captionFilters
      ]
        .filter(Boolean)
        .join(",");

      /* -------------------------------------------------------------------- */
      /* Image                                                                */
      /* -------------------------------------------------------------------- */

      if (actualClipType === "image") {
        await runFfmpeg([
          "-loop",
          "1",
          "-i",
          raw,
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=48000:cl=stereo",
          "-vf",
          vf,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-ar",
          "48000",
          "-t",
          String(
            fileDur
          ),
          "-pix_fmt",
          "yuv420p",
          "-y",
          scaled,
        ]);
      } else {
        /* ------------------------------------------------------------------ */
        /* Video                                                              */
        /* ------------------------------------------------------------------ */

        const inputArgs:
          string[] = [];

        if (
          scene.clipTrimStart !=
            null &&
          scene.clipTrimStart >
            0
        ) {
          inputArgs.push(
            "-ss",
            scene.clipTrimStart.toFixed(
              6
            )
          );
        }

        inputArgs.push(
          "-i",
          raw
        );

        const sourceDur =
          fileDur * speed;

        inputArgs.push(
          "-t",
          sourceDur.toFixed(
            6
          )
        );

        /*
         * Preserve the original scene audio.
         */

        const hasSourceAudio = await new Promise<boolean>((resolve) => {
          const p = spawn("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", raw]);
          let out = "";
          p.stdout?.on("data", (d) => { out += d.toString(); });
          p.on("close", () => resolve(out.includes("audio")));
          p.on("error", () => resolve(false));
        });

        if (hasSourceAudio && !(scene as any).muted) {
          // Input has audio — encode video and audio
          await runFfmpeg([
            ...inputArgs,
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-pix_fmt",
            "yuv420p",
            "-y",
            scaled,
          ]);
        } else {
          // Input is silent or muted — inject synchronized anullsrc stereo track so concat always succeeds
          await runFfmpeg([
            ...inputArgs,
            "-f",
            "lavfi",
            "-t",
            sourceDur.toFixed(6),
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-pix_fmt",
            "yuv420p",
            "-shortest",
            "-y",
            scaled,
          ]);
        }
      }

      scaledFiles.push(
        {
          file: scaled,

          displayDuration:
            displayDur,

          xfadeType,

          xfadeDur,
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Concatenate                                                            */
    /* ---------------------------------------------------------------------- */

    if (onProgress) onProgress(85);

    const concatenated =
      path.join(
        tmpDir,
        "concat.mp4"
      );

    tempFiles.push(
      concatenated
    );

    if (
      scaledFiles.length ===
      1
    ) {
      await runFfmpeg([
        "-i",
        scaledFiles[0]
          .file,

        "-c",
        "copy",

        "-y",
        concatenated,
      ]);
    } else {
      /* -------------------------------------------------------------------- */
      /* Legacy Crossfade Fallback (Bypassing xfade on Vercel)                */
      /* -------------------------------------------------------------------- */

      // Because Vercel's @ffmpeg-installer binary throws "No such filter: 'xfade'",
      // we must recreate crossfades mathematically using alpha blending and overlaps.
      
      const inputArgs = scaledFiles.flatMap((scene) => ["-i", scene.file]);
      const filterParts: string[] = [];
      
      let prevLabel = "[0:v]";
      let timeAcc = 0;

      for (let i = 0; i < scaledFiles.length - 1; i++) {
        const scene = scaledFiles[i];
        const lastTransition = i === scaledFiles.length - 2;
        const outLabel = lastTransition ? "[vout]" : `[vx${i}]`;
        const nextLabel = `[${i + 1}:v]`;

        if (scene.xfadeType && scene.xfadeDur > 0) {
          // Standard native xfade transition
          const offset = Math.max(0, timeAcc + scene.displayDuration - scene.xfadeDur);
          
          filterParts.push(
            `${prevLabel}${nextLabel}xfade=transition=${scene.xfadeType}:duration=${scene.xfadeDur.toFixed(4)}:offset=${offset.toFixed(4)}${outLabel}`
          );

          timeAcc += scene.displayDuration - scene.xfadeDur;
        } else {
          // Hard cut
          filterParts.push(
            `${prevLabel}${nextLabel}concat=n=2:v=1:a=0${outLabel}`
          );
          timeAcc += scene.displayDuration;
        }

        prevLabel = outLabel;
      }

      if (scaledFiles.length > 1) {
        const audioConcatParts = [];
        for (let i = 0; i < scaledFiles.length; i++) {
          audioConcatParts.push(`[${i}:a]`);
        }
        filterParts.push(`${audioConcatParts.join("")}concat=n=${scaledFiles.length}:v=0:a=1[aout]`);
      }

      await runFfmpeg([
        ...inputArgs,
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        "-y",
        concatenated,
      ]);
    }

    /* ---------------------------------------------------------------------- */
    /* Background audio & Brand Logo Watermark                                */
    /* ---------------------------------------------------------------------- */

    if (onProgress) onProgress(92);

    const hasOriginalAudio = params.scenes.some((s) => s.clipType === "video");
    
    // We will render to a pre-final file if an image or text logo needs to be overlaid
    const needsLogoOverlay = Boolean(logoFile) || (brand?.logoType === "text" && Boolean(brand?.logoText));
    const preFinal = needsLogoOverlay ? path.join(tmpDir, `prefinal-${uuidv4()}.mp4`) : outPath;
    if (needsLogoOverlay) tempFiles.push(preFinal);

    if (audio?.src) {
      console.log(
        "[FFmpeg Audio]",
        audio.src.slice(0, 100)
      );

      let resolvedAudioSrc = audio.src;
      if (resolvedAudioSrc.startsWith("/api/audio-proxy?url=")) {
        const rawUrl = resolvedAudioSrc.replace("/api/audio-proxy?url=", "");
        resolvedAudioSrc = decodeURIComponent(rawUrl);
      }

      let audioFile = "";
      if (resolvedAudioSrc.startsWith("local://")) {
        audioFile = resolvedAudioSrc.replace("local://", "");
        console.log(`[FFmpeg Audio] Using local EC2 audio: ${audioFile}`);
      } else if (resolvedAudioSrc.startsWith("http://") || resolvedAudioSrc.startsWith("https://")) {
        const ext = resolvedAudioSrc.includes(".wav") ? "wav" : resolvedAudioSrc.includes(".ogg") ? "ogg" : "mp3";
        audioFile = path.join(tmpDir, `bgm-${uuidv4()}.${ext}`);
        console.log(`[FFmpeg Audio] Downloading remote audio: ${resolvedAudioSrc}`);
        await downloadFile(resolvedAudioSrc, audioFile);
        tempFiles.push(audioFile);
      } else if (resolvedAudioSrc.startsWith("/")) {
        const localPublic = path.join(process.cwd(), "public", resolvedAudioSrc);
        if (fs.existsSync(localPublic)) {
          audioFile = localPublic;
          console.log(`[FFmpeg Audio] Using local public audio: ${audioFile}`);
        } else {
          audioFile = path.join(tmpDir, `bgm-${uuidv4()}.mp3`);
          console.log(`[FFmpeg Audio] Downloading local endpoint audio: ${resolvedAudioSrc}`);
          await downloadFile(`http://localhost:3000${resolvedAudioSrc}`, audioFile);
          tempFiles.push(audioFile);
        }
      } else if (resolvedAudioSrc && resolvedAudioSrc.startsWith("data:")) {
        audioFile = await saveBase64(resolvedAudioSrc, "m4a", tmpDir);
        tempFiles.push(audioFile);
      }

      const totalDur = params.totalDuration ?? scaledFiles.reduce((sum, scene) => sum + scene.displayDuration, 0);
      const volume = audio.volume ?? 0.7;
      const fadeIn = audio.fadeIn ?? 0.5;
      const fadeOut = audio.fadeOut ?? 1;
      const fadeOutStart = Math.max(0, totalDur - fadeOut);

      const mixFilter = hasOriginalAudio
        ? `[0:a]volume=1.0[orig_a];[1:a]volume=${volume},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}[bg_a];[orig_a][bg_a]amix=inputs=2:duration=first[a]`
        : `[1:a]volume=${volume},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}[a]`;

      await runFfmpeg([
        "-i", concatenated,
        "-i", audioFile,
        "-filter_complex", mixFilter,
        "-map", "0:v:0",
        "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-y",
        preFinal,
      ]);
    } else {
      await runFfmpeg([
        "-i", concatenated,
        "-map", "0:v:0",
        ...(hasOriginalAudio ? ["-map", "0:a:0"] : []),
        "-c:v", "copy",
        ...(hasOriginalAudio ? ["-c:a", "copy"] : []),
        "-y",
        preFinal,
      ]);
    }
    
    // Apply Brand Logo Watermark if present
    const hasImageLogo = Boolean(logoFile);
    const hasTextLogo = brand?.logoType === "text" && Boolean(brand?.logoText);

    if (hasImageLogo || hasTextLogo) {
      console.log(`[FFmpeg] Applying brand logo watermark...`);
      const opacity = Math.max(0.05, Math.min(1, brand?.logoOpacity ?? 0.85));
      const logoX = brand?.logoX ?? 80;
      const logoY = brand?.logoY ?? 80;
      const logoWidth = brand?.logoWidth ?? 20;

      // Calculate pixel coordinates relative to output video resolution [W, H]
      const wPx = Math.max(20, Math.round((logoWidth / 100) * W));
      const xPx = Math.max(0, Math.min(W - wPx, Math.round((logoX / 100) * W)));
      const yPx = Math.max(0, Math.min(H - 20, Math.round((logoY / 100) * H)));

      if (hasImageLogo) {
        let logoFilter = `[1:v]scale=${wPx}:-2,format=rgba`;

        // Apply monochrome tint via clean colorchannelmixer
        if (brand?.logoTintColor) {
          const hex = brand.logoTintColor.replace("#", "");
          const r = (parseInt(hex.substring(0, 2), 16) / 255).toFixed(3);
          const g = (parseInt(hex.substring(2, 4), 16) / 255).toFixed(3);
          const b = (parseInt(hex.substring(4, 6), 16) / 255).toFixed(3);
          logoFilter += `,colorchannelmixer=rr=${r}:rg=0:rb=0:gr=0:gg=${g}:gb=0:br=0:bg=0:bb=${b}:aa=${opacity}`;
        } else {
          logoFilter += `,colorchannelmixer=aa=${opacity}`;
        }
        logoFilter += `[logo]`;

        const overlayFilter = `${logoFilter};[0:v][logo]overlay=${xPx}:${yPx}`;

        await runFfmpeg([
          "-i", preFinal,
          "-i", logoFile,
          "-filter_complex", overlayFilter,
          "-c:a", "copy",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-y",
          outPath,
        ]);
      } else if (hasTextLogo) {
        const fontPath = findSystemFont(brand?.fontFamily);
        const fontArg = fontPath ? `:fontfile='${escapeFontPathForFfmpeg(fontPath)}'` : "";
        const color = normalizeHexColor(brand?.primaryColor, "FFFFFF");
        const fontSize = Math.max(16, Math.min(120, Math.round(wPx / 4)));
        const drawFilter = `drawtext=text='${escapeDrawtext(brand?.logoText || "")}'${fontArg}:x=${xPx}:y=${yPx}:fontsize=${fontSize}:fontcolor=${color}@${opacity}:box=1:boxcolor=000000@0.3:boxborderw=8`;

        await runFfmpeg([
          "-i", preFinal,
          "-vf", drawFilter,
          "-c:a", "copy",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-y",
          outPath,
        ]);
      }
    }

    /* ---------------------------------------------------------------------- */
    /* Finished                                                               */
    /* ---------------------------------------------------------------------- */

    if (onProgress) onProgress(98);

    console.log(
      "[FFmpeg Render Complete]",
      {
        outputPath:
          outPath,
        filename:
          outFile,
      }
    );

    return {
      downloadUrl:
        outPath,

      filename:
        outFile,

      outputPath:
        outPath,
    };
  } finally {
    /*
     * Only remove intermediate files.
     *
     * Do NOT delete outPath here because route.ts still
     * needs to stream the finished MP4.
     */

    for (
      const file of
      tempFiles
    ) {
      unlink(
        file
      ).catch(() => {});
    }
  }
}
