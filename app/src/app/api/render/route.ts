import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { unlink } from "fs/promises";
import { renderVideo, getEngineType } from "@/lib/transcoder";
import type { SceneInput, AudioInput, BrandRenderInput } from "@/lib/transcoder";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scenes, audio, brand, aspectRatio, totalDuration, outputFilename } = body as {
      scenes: SceneInput[];
      audio?: AudioInput;
      brand?: BrandRenderInput;
      aspectRatio?: string;
      totalDuration?: number;
      outputFilename?: string;
    };

    if (!scenes?.length) {
      return NextResponse.json({ error: "No scenes provided." }, { status: 400 });
    }

    const missing: string[] = [];
    scenes.forEach((scene, index) => {
      if (!scene.clipData) missing.push(`Scene ${index + 1} media asset`);
      const hasSpeech = (scene.captions ?? []).some((caption) => caption.text?.trim());
      if (hasSpeech && !(scene.captions ?? []).length) missing.push(`Scene ${index + 1} caption timeline`);
    });
    if (brand?.logoData === "") missing.push("Brand logo asset");
    if (missing.length) {
      return NextResponse.json(
        { error: "Render validation failed.", missing },
        { status: 400 },
      );
    }

    const engine = getEngineType();
    const filename = outputFilename ?? `render-${Date.now()}.mp4`;

    const result = await renderVideo({ scenes, audio, brand, aspectRatio, totalDuration, outputFilename: filename });

    if (result.engine === "local") {
      const outputPath = result.outputPath;
      if (!outputPath) {
        return NextResponse.json({ error: "Render failed.", message: "Local output path missing." }, { status: 500 });
      }
      const stream = createReadStream(outputPath);
      stream.on("error", (err) => {
        console.error("stream error", err);
      });
      stream.on("close", () => {
        unlink(outputPath).catch(() => {});
      });
      return new NextResponse(stream, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      downloadUrl: result.downloadUrl,
      filename: result.filename,
      engine: result.engine,
      message: engine === "cloud"
        ? "Rendered via Google Cloud Transcoder."
        : "Rendered locally with FFmpeg. Set GCS_BUCKET in .env.local to enable cloud rendering.",
    });

  } catch (error) {
    console.error("[render]", error);
    return NextResponse.json(
      { error: "Render failed.", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
