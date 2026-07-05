import { NextRequest, NextResponse } from "next/server";
import { geminiRequest } from "@/lib/gemini";

export const maxDuration = 120;

const MODEL = "gemini-2.5-pro";

interface CaptionResult {
  text: string;
  startTime: number;
  endTime: number;
}

function normalizeCaptions(value: unknown, duration: number): CaptionResult[] {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item): CaptionResult | null => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      const startTime = Number(rec.startTime);
      const endTime = Number(rec.endTime);
      if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
      const start = Math.max(0, Math.min(duration, startTime));
      const end = Math.max(start + 0.2, Math.min(duration, endTime));
      return { text, startTime: start, endTime: end };
    })
    .filter((item): item is CaptionResult => item !== null)
    .slice(0, 80);
}

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
    const response = await geminiRequest(MODEL, {
      contents: [{
        role: "user",
        parts: [
          {
            text: `Transcribe only the spoken words in this clip into timed captions.
Return JSON only:
{
  "captions": [
    { "text": "exact spoken words", "startTime": 0.0, "endTime": 1.8 }
  ]
}
Rules:
- Captions must be based on audible speech, not the filename or visual guesses.
- Keep each caption short and natural.
- Use seconds relative to the start of this clip.
- If no speech is audible, return { "captions": [] }.
- Clip duration is about ${duration.toFixed(2)} seconds.`,
          },
          {
            inlineData: {
              mimeType,
              data: buffer.toString("base64"),
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    const text = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim()) as { captions?: unknown };
    return NextResponse.json({ captions: normalizeCaptions(parsed.captions, duration) });
  } catch (error) {
    console.error("[transcribe-clip]", error);
    return NextResponse.json({ error: "Could not transcribe clip" }, { status: 500 });
  }
}
