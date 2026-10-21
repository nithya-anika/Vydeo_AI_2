import { NextRequest, NextResponse } from "next/server";
import { transcribeClipWithGemini } from "@/lib/transcription";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const duration = Math.max(0.5, Number(form.get("duration")) || 8);
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "video/mp4";

    const result = await transcribeClipWithGemini({
      base64Data: buffer.toString("base64"),
      mimeType,
      duration,
    });

    return NextResponse.json({
      captions: result.segments,
      hasSpeech: result.hasSpeech,
      silenceWindows: result.silenceWindows,
      fullTranscript: result.fullTranscript,
    });
  } catch (error) {
    console.error("[transcribe-clip]", error);
    return NextResponse.json({ error: "Could not transcribe clip" }, { status: 500 });
  }
}
