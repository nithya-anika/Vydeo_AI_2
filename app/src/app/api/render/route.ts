import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { unlink } from "fs/promises";
import { Readable } from "stream";
import { renderVideo, getEngineType } from "@/lib/transcoder";
import type { SceneInput, AudioInput, BrandRenderInput } from "@/lib/transcoder";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();

    const {
      scenes,
      audio,
      brand,
      aspectRatio,
      totalDuration,
      outputFilename,
    } = body as {
      scenes: SceneInput[];
      audio?: AudioInput;
      brand?: BrandRenderInput;
      aspectRatio?: string;
      totalDuration?: number;
      outputFilename?: string;
    };

    // Validate scenes
    if (!scenes?.length) {
      return NextResponse.json(
        { error: "No scenes provided." },
        { status: 400 }
      );
    }

    // Validate required render assets
    const missing: string[] = [];

    scenes.forEach((scene, index) => {
      if (!scene.clipData) {
        missing.push(`Scene ${index + 1} media asset`);
      }

      const captions = scene.captions ?? [];

      const hasSpeech = captions.some(
        (caption) => caption.text?.trim()
      );

      if (hasSpeech && captions.length === 0) {
        missing.push(`Scene ${index + 1} caption timeline`);
      }
    });

    // Validate brand logo
    if (brand?.logoData === "") {
      missing.push("Brand logo asset");
    }

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Render validation failed.",
          missing,
        },
        { status: 400 }
      );
    }

    // Determine rendering engine
    const engine = getEngineType();

    // Generate output filename
    const filename =
      outputFilename ?? `render-${Date.now()}.mp4`;

    // Render video
    const result = await renderVideo({
      scenes,
      audio,
      brand,
      aspectRatio,
      totalDuration,
      outputFilename: filename,
    });

    // -----------------------------------
    // LOCAL FFMPEG RENDER
    // -----------------------------------

    if (result.engine === "local") {
      const outputPath = result.outputPath;

      if (!outputPath) {
        return NextResponse.json(
          {
            error: "Render failed.",
            message: "Local output path missing.",
          },
          { status: 500 }
        );
      }

      const nodeStream = createReadStream(outputPath);
      const body = Readable.toWeb(nodeStream) as unknown as BodyInit;

      nodeStream.on("error", (error) => {
        console.error("[render stream]", error);
      });

      // Delete temporary file after stream finishes
      nodeStream.on("close", () => {
        unlink(outputPath).catch((error) => {
          console.error(
            "[render cleanup] Failed to delete temporary file:",
            error
          );
        });
      });

      return new NextResponse(body, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // -----------------------------------
    // GOOGLE CLOUD TRANSCODER RENDER
    // -----------------------------------

    return NextResponse.json({
      success: true,
      downloadUrl: result.downloadUrl,
      filename: result.filename,
      engine: result.engine,
      message:
        engine === "cloud"
          ? "Rendered via Google Cloud Transcoder."
          : "Rendered locally with FFmpeg. Set GCS_BUCKET in .env.local to enable cloud rendering.",
    });
  } catch (error) {
    console.error("[render]", error);

    return NextResponse.json(
      {
        error: "Render failed.",
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
