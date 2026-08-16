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
2. These suggestions MUST focus EXCLUSIVELY on REARRANGING the clips (e.g., clip sequence, who appears first, which clip follows). DO NOT mention transitions, color grading, subtitles, fast/slow pacing, or music. Keep the suggested prompts purely about the chronological order and arrangement based on the visual contents.
3. You MUST wrap EACH suggested prompt individually inside its own <suggested_prompt> tags. 
   Example:
   "Here are 3 ways we can arrange your clips:
   <suggested_prompt>Start with the laptop girl clip, then the white dress girl, and finally the black dress girl. Keep remaining clips at the end.</suggested_prompt>
   <suggested_prompt>Start with the white dress girl, follow by the striped man, and put the laptop girl at the very end.</suggested_prompt>
   <suggested_prompt>Begin with the black dress girl, follow with the laptop girl, and place all remaining clips at the end.</suggested_prompt>
   
   Would you like to use one of these, or would you like to provide more details to modify them?"
4. Always ask the user if they want to modify/refine the prompts or if they are happy to use one.
5. EXTREMELY IMPORTANT: Keep your suggestions concise but highly descriptive of the visual elements. You MUST finish your entire response completely. NEVER cut off your response mid-sentence. Ensure all 3 <suggested_prompt> tags are fully closed.`;

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

    const response = await geminiRequest("gemini-2.5-pro", {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    const raw = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return NextResponse.json({ success: true, text: raw });
  } catch (error) {
    console.error("[suggest-prompt] Error:", error);
    return NextResponse.json({ error: "Failed to generate suggestion." }, { status: 500 });
  }
}
