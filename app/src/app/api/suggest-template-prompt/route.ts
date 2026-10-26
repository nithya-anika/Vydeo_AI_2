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

Write ONE cohesive, cinematic paragraph (no bullet points, no extra chat) that provides comprehensive editing instructions. You MUST explicitly direct the AI to produce a clean, highly polished final clip by including:
1. Video Arrangement & Trimming: "Trim all dead space, remove outtakes, and ensure every clip is cut cleanly to its best moment WITHOUT cutting off any active speech or important native audio."
2. Audio Flow & Clarity: "Ensure the audio is crystal clear, seamlessly duck background music during speech, and create a smooth, professional soundscape."
3. Neat Transitions & Pacing: "Use neat, seamless transitions (like smooth dissolves or precise hard cuts) to maintain excellent flow and pacing."
4. Visuals & Aesthetic: Integrate the uploaded reference subjects seamlessly into the template's mood.

Make it incredibly descriptive and actionable so the AI editor builds a perfectly neat, clear, and professional video.`;

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