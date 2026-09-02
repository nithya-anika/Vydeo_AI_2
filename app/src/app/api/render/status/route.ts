import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing parameter", message: "jobId is required." },
        { status: 400 }
      );
    }

    const db = await getDb();
    const job = await db.collection("render_jobs").findOne({ id: jobId });

    if (!job) {
      return NextResponse.json(
        { error: "Not Found", message: "Job not found in database." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      id: job.id,
      status: job.status,
      downloadUrl: job.downloadUrl || null,
      filename: job.filename || null,
      error: job.error || null,
      progress: job.progress ?? 0,
      createdAt: job.createdAt,
    });
  } catch (error) {
    console.error("[render-status] API Error:", error);
    return NextResponse.json(
      {
        error: "Internal Error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
