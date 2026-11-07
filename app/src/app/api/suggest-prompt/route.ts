import { NextRequest, NextResponse } from "next/server";
import { geminiRequest } from "@/lib/gemini";
import { getModel } from "@/lib/ai-router";

export const maxDuration = 300; // Increased to 5 mins for heavy diagnostic processing
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
1. Provide EXACTLY 3 different prompt suggestions.
2. Your suggestions MUST be formatted exactly like a Master Editor's brief. You must explicitly list EVERY SINGLE CLIP and dictate what to do with it (trim, keep, or omit if duplicate).
3. Follow this EXACT template structure for EVERY suggestion:

   Example format you MUST follow:
   <suggested_prompt>
   [Core Intent: e.g., Assemble a fast-paced, cinematic product review.]
   
   Clip 1: Use this as the hook. Trim the dead space at the beginning (0:00 to 0:04).
   Clip 2: The timing is perfect, keep the dialogue completely intact.
   Clip 3: This is a duplicate of Clip 2, omit it completely.
   Clip 4: Trim the awkward trailing silence at the end.
   
   Flow & Style: Sequence the remaining clips chronologically. Use sharp, clean cuts between scenes. Duck the ambient background music down to 15% so vocals are crystal clear. Maintain a high-energy tone throughout.
   </suggested_prompt>

4. Make sure you detect duplicates (based on transcript/description similarities) and explicitly tell the editor to omit them. 
5. DO NOT include any conversational filler outside of the tags.
6. EXTREMELY IMPORTANT: You MUST finish your entire response completely. NEVER cut off your response mid-sentence. Ensure all 3 <suggested_prompt> tags are fully closed.`;

    // Construct the parts payload for Gemini
    const contents: any[] = [];

    // Inject clip context into the very first message invisibly
    let clipContextText = "UPLOADED CLIPS CONTEXT:\n";
    const inlineDatas: any[] = [];
    
    if (clips && clips.length > 0) {
      clips.forEach((c: any, index: number) => {
        clipContextText += `- Clip ${index + 1}: "${c.name}" (Duration: ${c.duration.toFixed(1)}s)\n`;
        if (c.transcript) {
          clipContextText += `  Spoken Transcript: "${c.transcript}"\n`;
        }
        if (c.speechSegments && c.speechSegments.length > 0) {
          c.speechSegments.forEach((seg: any) => {
            clipContextText += `  - "${seg.text}" (${seg.startTime.toFixed(2)}s to ${seg.endTime.toFixed(2)}s)\n`;
          });
        }
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

    const response = await geminiRequest(getModel("chat"), {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            prompts: {
              type: "ARRAY",
              description: "Exactly 3 distinct editorial prompt strings enclosed in <suggested_prompt> tags. Do not include conversational text, greetings, or questions.",
              items: { type: "STRING" }
            }
          },
          required: ["prompts"]
        }
      },
    });

    const text = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let prompts: string[] = [];
    try {
      const parsed = JSON.parse(text.replace(/^\s*(```json|```)/i, '').replace(/```\s*$/i, '').trim());
      if (parsed.prompts && Array.isArray(parsed.prompts)) {
        prompts = parsed.prompts;
      }
    } catch (e) {
       console.error("Failed to parse suggest-prompt JSON:", text, e);
    }

    if (prompts.length === 0) {
      throw new Error("No valid prompts returned from AI.");
    }

    // Combine them into the expected raw string format for the frontend regex parser
    let raw = "";
    for (const p of prompts) {
      let clean = p.trim();
      if (!clean.startsWith("<suggested_prompt>")) {
        clean = `<suggested_prompt>${clean}</suggested_prompt>`;
      }
      raw += clean + "\n";
    }

    return NextResponse.json({ success: true, text: raw });
  } catch (error) {
    console.error("[suggest-prompt] Error:", error);
    return NextResponse.json({ error: "Failed to generate suggestion." }, { status: 500 });
  }
}
