import { NextRequest, NextResponse } from "next/server";
import { geminiRequest } from "@/lib/gemini";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { messages, clips } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    // Build the system instructions
    let systemText = `You are a highly skilled AI Video Editor Prompt Consultant. 
Your goal is to help non-technical users craft the PERFECT prompt for our AI video editor.
The user has uploaded some video clips. You must analyze the provided clip metadata and frames (if any) to understand what they are working with.

When the user tells you what they want, suggest a highly specific, perfectly crafted prompt that focuses on:
- Clip arrangement (e.g. chronological, energy-based, specific sequences).
- Transitions (e.g. fade, cinematic-fade, wipe-left, slide-right).
- Pacing and trimming (e.g. trim silent pauses, fast-paced).
- Color grading or moods (e.g. warm, vibrant, dark, cinematic).

CRITICAL FORMATTING INSTRUCTION:
When you have a great prompt suggestion ready for the user, you MUST wrap the exact prompt text inside <suggested_prompt> tags. 
For example:
"Based on your clips, here is a great prompt:
<suggested_prompt>Start with the laptop girl clip, then the white dress girl, and finally the black dress girl. Keep remaining clips at the end and arrange them to keep conversations flowing smoothly.</suggested_prompt>
Would you like to use this, or shall we refine it further?"

Always be friendly, concise, and helpful.`;

    // Construct the parts payload for Gemini
    const contents: any[] = [];

    // Inject clip context into the very first message invisibly
    let clipContextText = "UPLOADED CLIPS CONTEXT:\n";
    const inlineDatas: any[] = [];
    
    if (clips && clips.length > 0) {
      clips.forEach((c: any, index: number) => {
        clipContextText += `- Clip ${index + 1}: "${c.name}" (Duration: ${c.duration.toFixed(1)}s)\n`;
        if (c.frames && Array.isArray(c.frames)) {
          c.frames.forEach((frameBase64: string, frameIdx: number) => {
            if (frameBase64) {
              const b64Data = frameBase64.replace(/^data:image\/\w+;base64,/, "");
              inlineDatas.push({
                inlineData: { mimeType: "image/jpeg", data: b64Data },
              });
            }
          });
        }
      });
    } else {
      clipContextText += "No clips uploaded yet.\n";
    }

    // Transform the conversation history
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = msg.role === "ai" ? "model" : "user";
      
      const parts: any[] = [{ text: msg.content }];
      
      // On the first user message, inject the system instructions and clip context
      if (i === 0 && role === "user") {
        parts[0].text = `[SYSTEM INSTRUCTIONS]:\n${systemText}\n\n[CLIP CONTEXT]:\n${clipContextText}\n\n[USER INPUT]:\n${msg.content}`;
        // Push the image frames into the first message so Gemini Vision can see them
        parts.push(...inlineDatas);
      }
      
      contents.push({ role, parts });
    }

    const response = await geminiRequest("gemini-2.5-flash", {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    const raw = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return NextResponse.json({ success: true, text: raw });
  } catch (error) {
    console.error("[suggest-prompt] Error:", error);
    return NextResponse.json({ error: "Failed to generate suggestion." }, { status: 500 });
  }
}
