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
2. Your suggestions MUST be formatted exactly like a Master Editor's brief. YOU MUST EXPLICITLY LIST EVERY SINGLE UPLOADED CLIP provided in the CLIP CONTEXT below, without exception. For each clip, you must dictate exactly what to do with it (e.g. trim it, keep it intact, or explicitly omit it if it is a duplicate or unusable).
3. Follow this EXACT template structure for EVERY suggestion:

   Example format you MUST follow:
   <suggested_prompt>
   [Core Intent: e.g., Assemble a fast-paced, cinematic product review.]
   
   Clip "IMG_7372 2": Use this as the hook. Trim the dead space at the beginning (0:00 to 0:04).
   Clip "IMG_1024": The timing is perfect, keep the dialogue completely intact.
   Clip "IMG_1025": This is a duplicate of "IMG_1024", omit it completely.
   Clip "IMG_8888": Trim the awkward trailing silence at the end.
   
   Flow & Style: Sequence the remaining clips: Start with "IMG_7372 2", then "IMG_1024", then "IMG_8888". Use sharp, clean cuts between scenes. Duck the ambient background music down to 15% so vocals are crystal clear. Maintain a high-energy tone throughout.
   </suggested_prompt>

   CRITICAL: You MUST use the exact actual filename (e.g. "IMG_7372 2") when referencing clips in both the TRIMMING and FLOW sections. Do NOT use generic labels like "Clip 1" or "Clip 2".

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

    const response = await geminiRequest(getModel("planning"), {
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

    const text = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    // Instead of strict JSON parsing (which fails if the AI hits a token limit mid-generation),
    // we use a resilient Regex extraction to pull whatever suggested prompts the AI successfully wrote.
    let raw = "";
    const regex = /<suggested_prompt>([\s\S]*?)(?:<\/suggested_prompt>|$)/g;
    let match;
    let count = 0;
    
    // First try to parse as JSON just in case it is well-formed
    try {
      const parsed = JSON.parse(text.replace(/^\s*(```json|```)/i, '').replace(/```\s*$/i, '').trim());
      if (parsed.prompts && Array.isArray(parsed.prompts)) {
        for (const p of parsed.prompts) {
          let clean = p.trim();
          if (!clean.startsWith("<suggested_prompt>")) {
            clean = `<suggested_prompt>\n${clean}\n</suggested_prompt>`;
          }
          raw += clean + "\n";
          count++;
        }
      }
    } catch (e) {
      console.warn("[suggest-prompt] JSON parse failed, falling back to raw regex extraction due to truncation.");
    }

    // If JSON parsing failed or returned nothing, extract manually
    if (count === 0 && text.includes("<suggested_prompt>")) {
      while ((match = regex.exec(text)) !== null) {
        raw += `<suggested_prompt>\n${match[1].trim()}\n</suggested_prompt>\n`;
        count++;
      }
    }

    if (count === 0) {
      console.error("Raw AI Output:", text);
      throw new Error("No valid prompts returned from AI.");
    }

    return NextResponse.json({ success: true, text: raw });
  } catch (error) {
    console.error("[suggest-prompt] Error:", error);
    return NextResponse.json({ error: "Failed to generate suggestion." }, { status: 500 });
  }
}
