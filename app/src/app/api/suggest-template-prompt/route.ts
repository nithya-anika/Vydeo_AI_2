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
Your goal is to write 3 distinct, highly detailed, single-paragraph editorial prompts for an AI video editor based on the user's template selection and uploaded assets.

Template: ${templateName}
Platform: ${platform}
Duration: ${duration}
User Uploaded File Names: ${refsStr}

Provide 3 different creative angles (e.g., 1. Fast & energetic, 2. Cinematic & moody, 3. Balanced & narrative-driven).
Each prompt must be ONE cohesive paragraph.
You MUST explicitly direct the AI to produce a clean, highly polished final clip by including the following rules in every prompt:
1. Video Arrangement & Trimming: "Trim all dead space, remove outtakes, and ensure every clip is cut cleanly to its best moment WITHOUT cutting off any active speech or important native audio."
2. Audio Flow & Clarity: "Ensure the audio is crystal clear, seamlessly duck background music during speech, and create a smooth, professional soundscape."
3. Neat Transitions & Pacing: "Use neat, seamless transitions (like smooth dissolves or precise hard cuts) to maintain excellent flow and pacing."
4. Visuals & Aesthetic: Integrate the uploaded reference subjects seamlessly into the template's mood.

Return EXACTLY a valid JSON array of 3 strings. Example format: ["prompt 1...", "prompt 2...", "prompt 3..."]
Do not use markdown blocks, just raw JSON array.`;

    const contents = [{ role: "user", parts: [{ text: systemText }] }];

    const response = await geminiRequest(getModel("chat"), {
      contents,
      generationConfig: { 
        temperature: 0.7, 
        maxOutputTokens: 2000, 
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          description: "An array of exactly 3 highly detailed editorial prompt strings. Do not include conversational text.",
          items: {
            type: "STRING"
          }
        }
      },
    });

    const text = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    let prompts: string[] = [];
    try {
      prompts = JSON.parse(text);
      if (!Array.isArray(prompts)) prompts = [text];
    } catch {
      prompts = [text];
    }
    
    // Filter out any accidental conversational filler that might have snuck into the array items
    prompts = prompts.map(p => p.trim()).filter(p => p.length > 20 && !p.toLowerCase().includes("here are 3 ways") && !p.toLowerCase().includes("would you like to use"));

    return NextResponse.json({ success: true, prompts });
  } catch (error) {
    console.error("[api/suggest-template-prompt] Error:", error);
    return NextResponse.json({ error: "Failed to generate prompt suggestion." }, { status: 500 });
  }
}