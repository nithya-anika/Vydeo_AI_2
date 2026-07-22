/**
 * Local FFmpeg rendering — fallback when GCS_BUCKET is not configured.
 */

import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";

import type { RenderCaption, RenderParams } from "./transcoder";

/* -------------------------------------------------------------------------- */
/* FFmpeg                                                                     */
/* -------------------------------------------------------------------------- */

function findFfmpeg(): string {
  const candidates = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "ffmpeg",
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require("@ffmpeg-installer/ffmpeg");

    if (installer?.path && existsSync(installer.path)) {
      return installer.path;
    }
  } catch {
    // Ignore and fall back to PATH.
  }

  return "ffmpeg";
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = findFfmpeg();

    const proc = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `FFmpeg exited ${code}: ${stderr.slice(-800)}`
        )
      );
    });

    proc.on("error", (error) => {
      reject(
        new Error(`FFmpeg spawn: ${error.message}`)
      );
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Base64 files                                                               */
/* -------------------------------------------------------------------------- */

async function saveBase64(
  dataUrl: string,
  ext: string,
  dir: string
): Promise<string> {
  const separator = dataUrl.indexOf(",");

  if (separator === -1) {
    throw new Error("Expected base64 data-url");
  }

  const buffer = Buffer.from(
    dataUrl.slice(separator + 1),
    "base64"
  );

  const actualExt = dataUrlExt(dataUrl, ext);

  const file = path.join(
    dir,
    `${uuidv4()}.${actualExt}`
  );

  await writeFile(file, buffer);

  return file;
}

function dataUrlExt(
  dataUrl: string,
  fallback: string
): string {
  const mime =
    dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "";

  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";

  if (
    mime.includes("jpeg") ||
    mime.includes("jpg")
  ) {
    return "jpg";
  }

  if (mime.includes("webm")) return "webm";
  if (mime.includes("mov")) return "mov";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mpeg")) return "mpg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";

  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Colors                                                                     */
/* -------------------------------------------------------------------------- */

function normalizeHexColor(
  value: string | undefined,
  fallback: string
): string {
  const raw = (value ?? "").trim();

  const hex = raw.startsWith("#")
    ? raw.slice(1)
    : raw;

  return /^[0-9a-f]{6}$/i.test(hex)
    ? hex.toUpperCase()
    : fallback;
}

/* -------------------------------------------------------------------------- */
/* Captions                                                                   */
/* -------------------------------------------------------------------------- */

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%");
}

function captionToFilter(
  caption: RenderCaption,
  width: number,
  height: number
): string | null {
  const text = caption.text?.trim();

  const start = Math.max(
    0,
    Number(caption.startTime)
  );

  const end = Math.max(
    start + 0.1,
    Number(caption.endTime)
  );

  if (
    !text ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return null;
  }

  const fontSize = Math.max(
    18,
    Math.min(
      96,
      Math.round(caption.fontSize ?? 34)
    )
  );

  const color = normalizeHexColor(
    caption.color,
    "FFFFFF"
  );

  const boxColor = normalizeHexColor(
    caption.bgColor,
    "000000"
  );

  const boxOpacity = Math.max(
    0,
    Math.min(
      1,
      caption.bgOpacity ?? 0.48
    )
  );

  const xPct =
    Math.max(
      5,
      Math.min(95, caption.x ?? 50)
    ) / 100;

  const yPct =
    Math.max(
      5,
      Math.min(95, caption.y ?? 84)
    ) / 100;

  const yPx = Math.round(height * yPct);

  const weight = caption.bold
    ? ":font='Inter:style=Bold'"
    : "";

  return [
    "drawtext=",
    `text='${escapeDrawtext(text)}'`,
    weight,
    `:x='${Math.round(width * xPct)}-text_w/2'`,
    `:y='${yPx}-text_h/2'`,
    `:fontsize=${fontSize}`,
    `:fontcolor=${color}`,
    `:box=1:boxcolor=${boxColor}@${boxOpacity.toFixed(2)}:boxborderw=18`,
    ":line_spacing=6",
    `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`,
  ].join("");
}

/* -------------------------------------------------------------------------- */
/* Aspect ratios                                                              */
/* -------------------------------------------------------------------------- */

export function ratioDimensions(
  ratio: string
): [number, number] {
  switch (ratio) {
    case "16:9":
      return [1920, 1080];

    case "1:1":
      return [1080, 1080];

    case "4:5":
      return [1080, 1350];

    case "3:4":
      return [1080, 1440];

    default:
      return [1080, 1920];
  }
}

/* -------------------------------------------------------------------------- */
/* Effects                                                                    */
/* -------------------------------------------------------------------------- */

export function effectToVfFilter(
  effect: string
): string {
  const e = effect
    .toLowerCase()
    .replace(/[\s_-]+/g, "-");

  if (
    e.includes("black-and-white") ||
    e.includes("grayscale") ||
    e.includes("bw")
  ) {
    return "hue=s=0";
  }

  if (
    e.includes("sepia") ||
    e.includes("vintage")
  ) {
    return "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131";
  }

  if (
    e.includes("warm") ||
    e.includes("golden")
  ) {
    return "colorbalance=rs=0.15:gs=0.05:bs=-0.15";
  }

  if (
    e.includes("cool") ||
    e.includes("cold")
  ) {
    return "colorbalance=rs=-0.1:gs=0:bs=0.2";
  }

  if (e.includes("vignette")) {
    return "vignette=angle=PI/4:mode=forward";
  }

  if (
    e.includes("blur") ||
    e.includes("dreamy")
  ) {
    return "boxblur=3:1";
  }

  if (
    e.includes("sharpen") ||
    e.includes("crisp")
  ) {
    return "unsharp=5:5:1.5:5:5:0.0";
  }

  if (
    e.includes("cinematic") ||
    e.includes("film")
  ) {
    return "curves=preset=strong_contrast,colorbalance=rs=0.05:bs=-0.05";
  }

  if (
    e.includes("matte") ||
    e.includes("fade")
  ) {
    return "curves=preset=lighter,eq=contrast=0.85:saturation=0.8";
  }

  if (
    e.includes("vibrant") ||
    e.includes("pop")
  ) {
    return "eq=saturation=1.4:contrast=1.1";
  }

  if (
    e.includes("moody") ||
    e.includes("dark")
  ) {
    return "eq=brightness=-0.05:contrast=1.15:saturation=0.85";
  }

  if (
    e.includes("bright") ||
    e.includes("light")
  ) {
    return "eq=brightness=0.08:contrast=0.95";
  }

  return "";
}

/* -------------------------------------------------------------------------- */
/* Audio speed                                                                */
/* -------------------------------------------------------------------------- */

export function buildAtempoChain(
  speed: number
): string {
  const filters: string[] = [];

  let rate = speed;

  while (rate > 2.0 + 1e-6) {
    filters.push("atempo=2.0");
    rate /= 2.0;
  }

  while (rate < 0.5 - 1e-6) {
    filters.push("atempo=0.5");
    rate /= 0.5;
  }

  filters.push(
    `atempo=${rate.toFixed(6)}`
  );

  return filters.join(",");
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
/* Render result                                                              */
/* -------------------------------------------------------------------------- */

export interface FfmpegRenderResult {
  downloadUrl: string;
  filename: string;
  outputPath: string;
}

/* -------------------------------------------------------------------------- */
/* Main renderer                                                              */
/* -------------------------------------------------------------------------- */

export async function renderWithFfmpeg(
  params: RenderParams
): Promise<FfmpegRenderResult> {
  const {
    scenes,
    audio,
    aspectRatio = "9:16",
    outputFilename,
  } = params;

  const tmpDir = path.join(
    os.tmpdir(),
    "ai-video-renders",
    uuidv4()
  );

  const outDir = path.join(
    tmpDir,
    "output"
  );

  const outFile =
    outputFilename ??
    `render-${uuidv4()}.mp4`;

  const outPath = path.join(
    outDir,
    outFile
  );

  await mkdir(tmpDir, {
    recursive: true,
  });

  await mkdir(outDir, {
    recursive: true,
  });

  const [W, H] =
    ratioDimensions(aspectRatio);

  const tempFiles: string[] = [];

  try {
    /* ---------------------------------------------------------------------- */
    /* Detect transitions                                                     */
    /* ---------------------------------------------------------------------- */

    const useXfade = scenes.some(
      (scene, index) =>
        index < scenes.length - 1 &&
        scene.transition &&
        toXfadeType(
          scene.transition.type
        ) !== ""
    );

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
      si < scenes.length;
      si++
    ) {
      const scene = scenes[si];

      const isLast =
        si === scenes.length - 1;

      const speed =
        scene.playbackSpeed ?? 1;

      const transOut =
        scene.transition;

      const xfadeType = isLast
        ? ""
        : transOut
          ? toXfadeType(
              transOut.type
            )
          : "";

      const xfadeDur = isLast
        ? 0
        : xfadeType
          ? transOut?.duration ?? 0.5
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
        displayDur + overlapSec;

      /* Placeholder */

      if (!scene.clipData) {
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
          `color=c=black:s=${W}x${H}:d=${fileDur}`,
          "-c:v",
          "libx264",
          "-t",
          String(fileDur),
          "-pix_fmt",
          "yuv420p",
          "-y",
          placeholder,
        ]);

        scaledFiles.push({
          file: placeholder,
          displayDuration:
            displayDur,
          xfadeType,
          xfadeDur,
        });

        continue;
      }

      /* Save uploaded media */

      const ext =
        scene.clipExt ??
        (scene.clipType === "image"
          ? "jpg"
          : "mp4");

      const raw =
        await saveBase64(
          scene.clipData,
          ext,
          tmpDir
        );

      tempFiles.push(raw);

      const scaled = path.join(
        tmpDir,
        `sc-${si}-${scene.id}.mp4`
      );

      tempFiles.push(scaled);

      const scaleFilter =
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

      const speedFilter =
        speed !== 1
          ? `setpts=${(
              1 / speed
            ).toFixed(6)}*PTS`
          : "";

      const effectFilter =
        scene.visualEffect
          ? effectToVfFilter(
              scene.visualEffect
            )
          : "";

      const vf = [
        scaleFilter,
        speedFilter,
        effectFilter,
      ]
        .filter(Boolean)
        .join(",");

      /* Image */

      if (
        scene.clipType === "image"
      ) {
        await runFfmpeg([
          "-loop",
          "1",
          "-i",
          raw,
          "-vf",
          vf,
          "-c:v",
          "libx264",
          "-t",
          String(fileDur),
          "-pix_fmt",
          "yuv420p",
          "-y",
          scaled,
        ]);
      }

      /* Video */

      else {
        const inputArgs: string[] =
          [];

        if (
          scene.clipTrimStart !=
            null &&
          scene.clipTrimStart > 0
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
          sourceDur.toFixed(6)
        );

        const audioArgs =
          speed !== 1
            ? [
                "-af",
                buildAtempoChain(
                  speed
                ),
              ]
            : ["-an"];

        await runFfmpeg([
          ...inputArgs,

          "-vf",
          vf,

          ...audioArgs,

          "-c:v",
          "libx264",

          "-pix_fmt",
          "yuv420p",

          "-y",
          scaled,
        ]);
      }

      scaledFiles.push({
        file: scaled,
        displayDuration:
          displayDur,
        xfadeType,
        xfadeDur,
      });
    }

    /* ---------------------------------------------------------------------- */
    /* Concatenate                                                            */
    /* ---------------------------------------------------------------------- */

    const concatenated =
      path.join(
        tmpDir,
        "concat.mp4"
      );

    tempFiles.push(
      concatenated
    );

    if (
      scaledFiles.length === 1
    ) {
      await runFfmpeg([
        "-i",
        scaledFiles[0].file,

        "-c",
        "copy",

        "-y",
        concatenated,
      ]);
    }

    /* No transitions */

    else if (!useXfade) {
      const listFile =
        path.join(
          tmpDir,
          "list.txt"
        );

      tempFiles.push(
        listFile
      );

      await writeFile(
        listFile,
        scaledFiles
          .map(
            (scene) =>
              `file '${scene.file}'`
          )
          .join("\n")
      );

      await runFfmpeg([
        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        listFile,

        "-c",
        "copy",

        "-y",
        concatenated,
      ]);
    }

    /* Transitions */

    else {
      const inputArgs =
        scaledFiles.flatMap(
          (scene) => [
            "-i",
            scene.file,
          ]
        );

      const filterParts:
        string[] = [];

      let prevLabel = "[0:v]";

      let timeAcc = 0;

      for (
        let i = 0;
        i <
        scaledFiles.length - 1;
        i++
      ) {
        const scene =
          scaledFiles[i];

        const isLastTransition =
          i ===
          scaledFiles.length - 2;

        const outLabel =
          isLastTransition
            ? "[vout]"
            : `[vx${i}]`;

        const nextLabel =
          `[${i + 1}:v]`;

        if (scene.xfadeType) {
          const offset =
            Math.max(
              0,
              timeAcc +
                scene.displayDuration -
                scene.xfadeDur
            );

          filterParts.push(
            `${prevLabel}${nextLabel}` +
              `xfade=transition=${scene.xfadeType}` +
              `:duration=${scene.xfadeDur.toFixed(4)}` +
              `:offset=${offset.toFixed(4)}` +
              `${outLabel}`
          );

          timeAcc +=
            scene.displayDuration -
            scene.xfadeDur;
        } else {
          filterParts.push(
            `${prevLabel}${nextLabel}` +
              `concat=n=2:v=1:a=0` +
              `${outLabel}`
          );

          timeAcc +=
            scene.displayDuration;
        }

        prevLabel = outLabel;
      }

      await runFfmpeg([
        ...inputArgs,

        "-filter_complex",
        filterParts.join(";"),

        "-map",
        "[vout]",

        "-c:v",
        "libx264",

        "-pix_fmt",
        "yuv420p",

        "-y",
        concatenated,
      ]);
    }

    /* ---------------------------------------------------------------------- */
    /* Background music                                                       */
    /* ---------------------------------------------------------------------- */

    if (audio?.src) {
      const audioExt =
        audio.src.includes(
          "audio/mpeg"
        )
          ? "mp3"
          : audio.src.includes(
                "audio/wav"
              )
            ? "wav"
            : "m4a";

      const audioFile =
        await saveBase64(
          audio.src,
          audioExt,
          tmpDir
        );

      tempFiles.push(
        audioFile
      );

      const totalDur =
        params.totalDuration ??
        scaledFiles.reduce(
          (sum, scene) =>
            sum +
            scene.displayDuration,
          0
        );

      const volume =
        audio.volume ?? 0.7;

      const fadeIn =
        audio.fadeIn ?? 0.5;

      const fadeOut =
        audio.fadeOut ?? 1;

      await runFfmpeg([
        "-i",
        concatenated,

        "-i",
        audioFile,

        "-filter_complex",
        `[1:a]volume=${volume},` +
          `afade=t=in:st=0:d=${fadeIn},` +
          `afade=t=out:st=${Math.max(
            0,
            totalDur - fadeOut
          )}:d=${fadeOut},` +
          `apad[a]`,

        "-map",
        "0:v",

        "-map",
        "[a]",

        "-c:v",
        "copy",

        "-c:a",
        "aac",

        "-b:a",
        "192k",

        "-shortest",

        "-y",
        outPath,
      ]);
    } else {
      await runFfmpeg([
        "-i",
        concatenated,

        "-c",
        "copy",

        "-y",
        outPath,
      ]);
    }

    /* ---------------------------------------------------------------------- */
    /* IMPORTANT: outputPath is now part of the declared return type          */
    /* ---------------------------------------------------------------------- */

    return {
      downloadUrl: outPath,
      filename: outFile,
      outputPath: outPath,
    };
  } finally {
    /*
     * Delete intermediate files.
     *
     * Do NOT delete outPath here.
     * Your API route needs it so it can stream the finished MP4.
     */
    for (const file of tempFiles) {
      unlink(file).catch(() => {});
    }
  }
}
