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
Your goal is to write a highly detailed, single-paragraph editorial prompt for an AI video generator based on the user's template selection and uploaded assets.
Template: ${templateName}
Platform: ${platform}
Duration: ${duration}
User Uploaded File Names: ${refsStr}

Write ONE cohesive, cinematic paragraph (no bullet points, no extra chat). Describe the lighting, pacing, mood, transition style, and what subjects/actions should be featured based on the reference names or template vibe. Make it incredibly descriptive so the AI generates the perfect video.`;

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