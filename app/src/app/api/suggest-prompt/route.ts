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

CRITICAL INSTRUCTIONS:
1. When the user asks for initial suggestions, you MUST provide EXACTLY 3 different prompt suggestions.
2. These suggestions MUST focus heavily on REARRANGING the clips (e.g., specific clip order, pacing, slow to fast, story arcs) and suitable transitions.
3. You MUST wrap EACH suggested prompt individually inside its own <suggested_prompt> tags. 
   Example:
   "Here are 3 ways we can arrange your clips:
   <suggested_prompt>Start with the laptop girl clip, then the white dress girl, and finally the black dress girl. Keep remaining clips at the end and arrange them to keep conversations flowing smoothly.</suggested_prompt>
   <suggested_prompt>Create a fast-paced energy edit: intercut the black dress girl and white dress girl clips rapidly, using whip-pan transitions, and put the laptop girl at the very end.</suggested_prompt>
   <suggested_prompt>Arrange chronologically starting with the white dress, transition slowly into the black dress, and use the laptop girl as the outro.</suggested_prompt>
   
   Would you like to use one of these, or would you like to provide more details to modify them?"
4. Always ask the user if they want to modify/refine the prompts or if they are happy to use one.`;

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
