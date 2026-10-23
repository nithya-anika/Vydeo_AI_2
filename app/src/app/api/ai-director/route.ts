import { NextRequest, NextResponse } from "next/server";
import { geminiRequest } from "@/lib/gemini";
import { getModel } from "@/lib/ai-router";
import { safeParseJson } from "@/lib/json-repair";

export interface AIDirectorAction {
  type:
    | "UPDATE_SCENE"
    | "ADD_CAPTION"
    | "UPDATE_CAPTION"
    | "REMOVE_CAPTION"
    | "UPDATE_BRAND"
    | "SET_GLOBAL_TRANSITION"
    | "SET_GLOBAL_COLOR_GRADE"
    | "SET_GLOBAL_MOOD"
    | "SET_TIMELINE_PACING"
    | "REMOVE_SCENE";
  sceneId?: string;
  captionId?: string;
  patch?: Record<string, unknown>;
  caption?: Record<string, unknown>;
  value?: unknown;
}

export interface AIDirectorResponse {
  reply: string;
  actions: AIDirectorAction[];
}

const SYSTEM_PROMPT = `You are the AI Creative Director of VydeoAI, an advanced video editing application.
You converse with the user and have direct authority to inspect and mutate the video timeline and brand settings.

The user will provide:
1. "prompt": Their request, critique, or creative instruction (e.g., "make the logo smaller and put it on top-right", "increase pacing by 20%", "add luxury cinematic grade", "change subtitle font to Playfair Display", "add an outro caption").
2. "timeline": The current state of the timeline including scenes, captions, durations, transitions, and mood.
3. "brandKit": The current brand configuration, including primary/secondary colors, fonts, and logoOverlay.

YOUR GOAL:
Understand the user's creative intent deeply and return a JSON object with:
1. "reply": A concise, encouraging response explaining exactly what you changed and why it serves their creative vision.
2. "actions": An array of concrete mutation actions to execute on the editor state:

POSSIBLE ACTION TYPES:
- { "type": "UPDATE_BRAND", "patch": { "logoOverlay": { "enabled": true, "type": "image"|"text", "x": number(0-100), "y": number(0-100), "width": number(6-50), "opacity": number(0-1), "tintColor": string|null, "text": string }, "primaryColor": string, "secondaryColor": string, "accentColor": string, "fontHeading": string, "fontBody": string } }
- { "type": "SET_GLOBAL_TRANSITION", "value": { "type": "fade"|"dissolve"|"zoom-in"|"zoom-out"|"glitch"|"slide-left"|"cinematic-fade", "duration": number } }
- { "type": "SET_GLOBAL_COLOR_GRADE", "value": "Cinematic Grade"|"Vintage Film"|"Teal & Orange"|"Black & White"|"Neon Glow"|"Warm Glow"|"Cool Mist"|"Desaturated"|null }
- { "type": "SET_GLOBAL_MOOD", "value": "luxury"|"energetic"|"calm"|"dramatic"|"playful"|"neutral" }
- { "type": "SET_TIMELINE_PACING", "value": number } (e.g. 0.75 to make it 25% faster, 1.3 to make it slower)
- { "type": "UPDATE_SCENE", "sceneId": string, "patch": { "duration"?: number, "playbackRate"?: number, "transition"?: object, "colorGrade"?: string, "mood"?: string } }
- { "type": "ADD_CAPTION", "sceneId": string, "caption": { "text": string, "startTime"?: number, "endTime"?: number, "color"?: string, "fontSize"?: number, "fontFamily"?: string, "x"?: number, "y"?: number, "bold"?: boolean } }
- { "type": "UPDATE_CAPTION", "sceneId": string, "captionId": string, "patch": { "text"?: string, "color"?: string, "fontFamily"?: string, "fontSize"?: number, "bold"?: boolean, "x"?: number, "y"?: number } }
- { "type": "REMOVE_CAPTION", "sceneId": string, "captionId": string }
- { "type": "REMOVE_SCENE", "sceneId": string }

RULES:
- When the user asks about logo position or size, emit UPDATE_BRAND with logoOverlay fields (x, y, width, opacity). Quick presets: Top-Left is x:6, y:6; Top-Right is x:76, y:6; Bottom-Left is x:6, y:84; Bottom-Right is x:76, y:84; Center is x:40, y:45.
- When the user asks to change colors or fonts, update brandKit and/or scene captions.
- If the user asks a purely conversational question (e.g. "What do you think of this cut?"), emit an empty "actions" array and provide insightful feedback in "reply".
- Return ONLY strict JSON matching { "reply": string, "actions": array }. No markdown fences.`;

export async function POST(req: NextRequest) {
  try {
    const { prompt, timeline, brandKit, history } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const model = getModel("chat");
    const userMessage = JSON.stringify({
      userPrompt: prompt,
      currentTimeline: {
        totalDuration: timeline?.totalDuration,
        aspectRatio: timeline?.aspectRatio,
        sceneCount: timeline?.scenes?.length ?? 0,
        scenes: (timeline?.scenes || []).map((s: any) => ({
          id: s.id,
          label: s.label,
          description: s.description,
          duration: s.duration,
          transition: s.transition?.type,
          colorGrade: s.colorGrade,
          mood: s.mood,
          captions: (s.captions || []).map((c: any) => ({
            id: c.id,
            text: c.text,
            startTime: c.startTime,
            endTime: c.endTime,
            color: c.color,
            fontFamily: c.fontFamily,
          })),
        })),
      },
      currentBrandKit: brandKit ? {
        name: brandKit.name,
        primaryColor: brandKit.primaryColor,
        secondaryColor: brandKit.secondaryColor,
        fontHeading: brandKit.fontHeading,
        fontBody: brandKit.fontBody,
        logoOverlay: brandKit.logoOverlay,
      } : null,
      recentHistory: Array.isArray(history) ? history.slice(-4) : [],
    });

    const response = await geminiRequest(model, {
      contents: [
        { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\nUSER STATE & REQUEST:\n${userMessage}` }] },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const raw = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    const parsed = safeParseJson<AIDirectorResponse>(raw);

    if (!parsed || typeof parsed.reply !== "string" || !Array.isArray(parsed.actions)) {
      return NextResponse.json({
        reply: "I reviewed your request, but couldn't apply changes automatically. Please try rephrasing your request.",
        actions: [],
      });
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("[api/ai-director] error:", err);
    return NextResponse.json(
      {
        reply: "I ran into an issue connecting to the AI director service. Please try again in a moment.",
        actions: [],
      },
      { status: 500 }
    );
  }
}
