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

    // 3. Enter safe long-polling loop (idle checking MongoDB)
    const startTime = Date.now();
    const timeoutMs = 260000; // 4.3 minutes (safely under the 5 min HTTP limit)
    let completedJob: any = null;

    while (Date.now() - startTime < timeoutMs) {
      // Wait 3 seconds before querying again (friendly to DB)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const job = await db.collection("render_jobs").findOne({ id: jobId });
      if (!job) {
        return NextResponse.json(
          { error: "Internal Error", message: "Render job vanished from database." },
          { status: 500 }
        );
      }

      if (job.status === "completed") {
        completedJob = job;
        break;
      } else if (job.status === "failed") {
        return NextResponse.json(
          { error: "Render Failed", message: job.error || "The render worker failed to compile the video." },
          { status: 500 }
        );
      }
    }

    if (!completedJob) {
      // Job is taking longer than 4.3 minutes, return async payload so client can keep polling later
      return NextResponse.json({
        success: true,
        jobId,
        status: "processing",
        message: "Your video is rendering. It is taking slightly longer, but you don't have to stay on this page.",
      });
    }

    // 4. Return the finished S3 download URL!
    return NextResponse.json({
      success: true,
      downloadUrl: completedJob.downloadUrl,
      filename: completedJob.filename,
      engine: "local",
      message: "Rendered asynchronously via decoupled background worker.",
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
