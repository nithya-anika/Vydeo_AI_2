import { NextRequest, NextResponse } from "next/server";
import { getRenderProgress } from "@remotion/lambda/client";

export const maxDuration = 10;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const renderId = searchParams.get("renderId");
    const bucketName = searchParams.get("bucketName");

    if (!renderId || !bucketName) {
      return NextResponse.json({ error: "Missing renderId or bucketName" }, { status: 400 });
    }

    const region = (process.env.REMOTION_AWS_REGION || process.env.AWS_REGION || "eu-north-1") as any;
    const functionName = process.env.REMOTION_APP_FUNCTION_NAME;

    if (!functionName) {
      return NextResponse.json({ error: "Missing Remotion configuration" }, { status: 500 });
    }

    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region,
    });

    if (progress.done && progress.outputFile) {
      return NextResponse.json({
        done: true,
        downloadUrl: progress.outputFile,
        progress: 100,
      });
    } else if (progress.fatalErrorEncountered) {
      return NextResponse.json({
        done: false,
        error: progress.errors[0]?.message || "Unknown rendering error",
      }, { status: 500 });
    }

    return NextResponse.json({
      done: false,
      progress: Math.round(progress.overallProgress * 100),
    });
  } catch (error: any) {
    console.error("[Render Status] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch status" }, { status: 500 });
  }
}
