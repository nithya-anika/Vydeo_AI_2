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
/* FFmpeg                                                                     */
/* -------------------------------------------------------------------------- */

function findFfmpeg(): string {
  const candidates = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "ffmpeg",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require("@ffmpeg-installer/ffmpeg");

    if (
      installer?.path &&
      existsSync(installer.path)
    ) {
      return installer.path;
    }
  } catch {
    // Fall back to ffmpeg from PATH.
  }

  return "ffmpeg";
}

function runFfmpeg(
  args: string[]
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      const bin = findFfmpeg();

      console.log(
        "[FFmpeg]",
        bin,
        args.join(" ")
      );

      const proc = spawn(
        bin,
        args,
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

  return [
    "drawtext=",

    `text='${escapeDrawtext(
      text
    )}'`,

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
  ratio: string
): [number, number] {
  switch (ratio) {
    case "16:9":
      return [
        1920,
        1080,
      ];

    case "1:1":
      return [
        1080,
        1080,
      ];

    case "4:5":
      return [
        1080,
        1350,
      ];

    case "3:4":
      return [
        1080,
        1440,
      ];

    default:
      return [
        1080,
        1920,
      ];
  }
}

/* -------------------------------------------------------------------------- */
/* Visual effects                                                             */
/* -------------------------------------------------------------------------- */

export function effectToVfFilter(
  effect: string
): string {
  const e =
    effect
      .toLowerCase()
      .replace(
        /[\s_-]+/g,
        "-"
      );

  if (
    e.includes(
      "black-and-white"
    ) ||
    e.includes(
      "grayscale"
    ) ||
    e.includes("bw")
  ) {
    return "hue=s=0";
  }

  if (
    e.includes(
      "sepia"
    ) ||
    e.includes(
      "vintage"
    )
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

  if (
    e.includes(
      "vignette"
    )
  ) {
    return "vignette=angle=PI/4:mode=forward";
  }

  if (
    e.includes("blur") ||
    e.includes("dreamy")
  ) {
    return "boxblur=3:1";
  }

  if (
    e.includes(
      "sharpen"
    ) ||
    e.includes("crisp")
  ) {
    return "unsharp=5:5:1.5:5:5:0.0";
  }

  if (
    e.includes(
      "cinematic"
    ) ||
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
    e.includes(
      "vibrant"
    ) ||
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
  params: RenderParams
): Promise<FfmpegRenderResult> {
  const {
    scenes,
    audio,
    aspectRatio =
      "9:16",
    outputFilename,
  } = params;

  const tmpDir =
    path.join(
      os.tmpdir(),
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
      aspectRatio
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
      const scene =
        scenes[si];

      const isLast =
        si ===
        scenes.length -
          1;

      const speed =
        scene.playbackSpeed ??
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

      const fallbackExt =
        scene.clipType ===
        "image"
          ? "jpg"
          : "mp4";

      const mediaDataUrl =
        scene.clipData ??
        (scene.clipSrc
          ? await fetchMediaDataUrl(scene.clipSrc)
          : null);

      if (!mediaDataUrl) {
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

      const raw =
        await saveBase64(
          mediaDataUrl,
          fallbackExt,
          tmpDir
        );

      tempFiles.push(
        raw
      );

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

      const scaleFilter =
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

      const fpsFilter = "fps=30";

      const speedFilter =
        speed !== 1
          ? `setpts=${(
              1 / speed
            ).toFixed(
              6
            )}*PTS`
          : "";

      const effectFilter =
        scene.visualEffect
          ? effectToVfFilter(
              scene.visualEffect
            )
          : "";

      const vf = [
        scaleFilter,
        fpsFilter,
        speedFilter,
        effectFilter,
      ]
        .filter(Boolean)
        .join(",");

      /* -------------------------------------------------------------------- */
      /* Image                                                                */
      /* -------------------------------------------------------------------- */

      if (
        scene.clipType ===
        "image"
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
         * We don't need the original scene audio here.
         * Final background audio is added later.
         */

        await runFfmpeg([
          ...inputArgs,

          "-vf",
          vf,

          "-an",

          "-c:v",
          "libx264",

          "-pix_fmt",
          "yuv420p",

          "-y",
          scaled,
        ]);
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
      /* Concat Fallback (Bypassing xfade on Vercel)                          */
      /* -------------------------------------------------------------------- */

      // Because Vercel's @ffmpeg-installer binary throws "No such filter: 'xfade'",
      // and standard concat demuxer (-f concat) breaks on trimmed/speed-modified clips,
      // we gracefully downgrade to in-memory filter_complex concat for all clips.
      
      const inputArgs = scaledFiles.flatMap((scene) => ["-i", scene.file]);
      
      const concatFilter = scaledFiles.map((_, i) => `[${i}:v]`).join("") + 
        `concat=n=${scaledFiles.length}:v=1:a=0[vout]`;

      await runFfmpeg([
        ...inputArgs,
        "-filter_complex",
        concatFilter,
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
    /* Background audio                                                       */
    /* ---------------------------------------------------------------------- */

    if (audio?.src) {
      console.log(
        "[FFmpeg Audio]",
        audio.src.slice(
          0,
          100
        )
      );

      const audioFile =
        await saveBase64(
          audio.src,
          "m4a",
          tmpDir
        );

      tempFiles.push(
        audioFile
      );

      const totalDur =
        params.totalDuration ??
        scaledFiles.reduce(
          (sum, scene) => sum + scene.displayDuration, 0
        );

      const volume = audio.volume ?? 0.7;
      const fadeIn = audio.fadeIn ?? 0.5;
      const fadeOut = audio.fadeOut ?? 1;
      const fadeOutStart = Math.max(0, totalDur - fadeOut);

      await runFfmpeg([
        "-i",
        concatenated,
        "-i",
        audioFile,
        "-filter_complex",
        `[1:a]volume=${volume},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}[a]`,
        "-map",
        "0:v:0",
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
        "-c:v",
        "copy",
        "-y",
        outPath,
      ]);
    }

    /* ---------------------------------------------------------------------- */
    /* Finished                                                               */
    /* ---------------------------------------------------------------------- */

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
