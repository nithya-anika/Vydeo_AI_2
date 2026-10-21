import { NextRequest, NextResponse } from "next/server";
import { gunzipSync } from "zlib";
import { getDb } from "@/lib/mongodb";
import { sendRenderJob } from "@/lib/sqs";
import { v4 as uuidv4 } from "uuid";
import type { SceneInput, AudioInput, BrandRenderInput } from "@/lib/transcoder";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    const envelope = JSON.parse(rawBody) as {
      compressed?: boolean;
      encoding?: string;
      payload?: string;
      scenes?: SceneInput[];
      audio?: AudioInput;
      brand?: BrandRenderInput;
      aspectRatio?: string;
      totalDuration?: number;
      outputFilename?: string;
    };

    const body = envelope.compressed && envelope.payload
      ? (JSON.parse(
          gunzipSync(Buffer.from(envelope.payload, "base64")).toString("utf8")
        ) as {
          scenes: SceneInput[];
          audio?: AudioInput;
          brand?: BrandRenderInput;
          aspectRatio?: string;
          totalDuration?: number;
          outputFilename?: string;
        })
      : envelope;

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

    // Generate output filename
    const filename =
      outputFilename ?? `render-${Date.now()}.mp4`;

    const jobId = `job_${uuidv4()}`;

    // 1. Save "pending" state to MongoDB
    const db = await getDb();
    await db.collection("render_jobs").insertOne({
      id: jobId,
      status: "pending",
      filename,
      params: {
        scenes,
        audio,
        brand,
        aspectRatio,
        totalDuration,
        outputFilename: filename,
      },
      createdAt: new Date(),
    });

    console.log(`[Queue] Saved render job "${jobId}" to MongoDB.`);

    // 2. Push job to AWS SQS
    const queued = await sendRenderJob(jobId, {
      scenes,
      audio,
      brand,
      aspectRatio,
      totalDuration,
      outputFilename: filename,
    });

    if (!queued) {
      // Update DB state to failed
      await db.collection("render_jobs").updateOne(
        { id: jobId },
        { $set: { status: "failed", error: "Failed to queue job in SQS." } }
      );
      return NextResponse.json(
        { error: "Queue injection failed.", message: "Could not publish job to AWS SQS." },
        { status: 500 }
      );
    }

    console.log(`[Queue] Successfully enqueued "${jobId}" to SQS.`);

    // Immediately return the enqueued job details so the browser can poll asynchronously!
    return NextResponse.json({
      success: true,
      jobId,
      status: "pending",
      message: "Render job successfully enqueued. Processing in background...",
    });

  } catch (error) {
    console.error("[render] Fatal API Error:");
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    } else {
      console.error(error);
    }

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
