import { NextRequest, NextResponse } from "next/server";
import { geminiRequest } from "@/lib/gemini";
import { getModel } from "@/lib/ai-router";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { templateName, platform, duration, references } = await req.json();
    const refsStr = references ? JSON.stringify(references.map((r: any) => r.name)) : "None";

    let systemText = `You are a professional video editor and creative director. 
Your goal is to write a highly detailed, single-paragraph editorial prompt for an AI video editor based on the user's template selection and uploaded assets.

Template: ${templateName}
Platform: ${platform}
Duration: ${duration}
User Uploaded File Names: ${refsStr}

Write ONE cohesive, cinematic paragraph (no bullet points, no extra chat) that provides comprehensive editing instructions. You MUST include explicit directions on:
1. Video Arrangement & Trimming (e.g., "trim dead space, cut directly to peak action, filter out outtakes").
2. Audio Flow & Sound Design (e.g., "sync cuts to the beat, duck background audio during speech, layer cinematic sound effects").
3. Aesthetic & Pacing (e.g., fast cuts vs slow cinematic, mood, lighting, transition styles like zoom-ins or crossfades).
4. Visuals (what subjects or actions should be featured based on the reference names).

Make it incredibly descriptive and actionable so the AI editor builds the perfect video.`;

    const contents = [{ role: "user", parts: [{ text: systemText }] }];

    const response = await geminiRequest(getModel("chat"), {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
    });

    const text = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return NextResponse.json({ success: true, text: text.trim() });
  } catch (error) {
    console.error("[api/suggest-template-prompt] Error:", error);
    return NextResponse.json({ error: "Failed to generate prompt suggestion." }, { status: 500 });
  }
}