import { NextRequest, NextResponse } from "next/server";
import { geminiRequest } from "@/lib/gemini";
import {
  DEFAULT_PROMPT_COLOR,
  FOOTAGE_TRANSITION_TYPES,
  inferRequestedColorAdjustments,
  inferRequestedTransition,
  stripDirectEditorControls,
  type FootageTransitionType,
} from "@/lib/footagePromptControls";

export { inferRequestedColorAdjustments, inferRequestedTransition } from "@/lib/footagePromptControls";

export const maxDuration = 60;

const MODEL = "gemini-2.5-pro";
const VALID_TRANSITIONS = FOOTAGE_TRANSITION_TYPES;
type ValidTransition = FootageTransitionType;
const DEFAULT_COLOR = DEFAULT_PROMPT_COLOR;

const SYSTEM_PROMPT = `You are a production-grade AI video editor. You receive video clips WITH VISUAL FRAMES attached to each clip. Follow the creative brief EXACTLY — no approximations, no deviations.

━━━ MANDATORY PROCESS ━━━

STEP 1 — VISUAL ANALYSIS (required — inspect every frame):
For each clip, look at the frames and note:
• Who appears: gender, age, distinguishing features (sunglasses, hat, specific clothing)
• What is happening
• Write ALL findings in "reasoning"

STEP 2 — MAP PROMPT TO PLAN:
A. CLIP ORDERING — match people from visual analysis to prompt instructions:
   • "start with girl/woman" → find the clip where a girl/woman appears, put her clip FIRST in sceneOrder
   • "end with guy in sunglasses" → find the clip where someone wears sunglasses, put that clip LAST
   • Honour every position mentioned in the prompt

B. DIRECT EDITOR CONTROLS:
   • Transitions, slider adjustments, and LUT/color presets are browser-managed controls, not Gemini decisions
   • Return "cut" transitions and zero globalColorAdjustments; the web editor applies exact user values after this plan

D. AUDIO MUTING — when prompt says "remove audio", "mute clips", "no original sound":
   • Set "muteSourceAudio": true

E. TRIM — when prompt says "cut pauses" or "remove repeats":
   • Set trimStart > 0 to skip silence at the beginning of the clip

STEP 3 — VALIDATE (before outputting):
□ sceneOrder contains every clip index exactly once
□ transitions use "cut" and globalColorAdjustments contains zeros
□ do not choose LUT/color presets; the browser applies requested presets directly
□ muteSourceAudio is set correctly

━━━ OUTPUT (strict JSON, NO markdown, NO extra text) ━━━
{
  "reasoning": "Clip 0: man in grey shirt. Clip 1: GIRL in blue dress — goes FIRST. Clip 2: man with SUNGLASSES — goes LAST. Clip 3: another man.",
  "sceneOrder": [1, 0, 3, 2],
  "transitions": [
    {"afterClipIndex": 1, "type": "cut", "duration": 0.1},
    {"afterClipIndex": 0, "type": "cut", "duration": 0.1},
    {"afterClipIndex": 3, "type": "cut", "duration": 0.1}
  ],
  "globalColorAdjustments": {
    "exposure": 0,
    "contrast": 0,
    "saturation": 0,
    "temperature": 0,
    "tint": 0,
    "highlights": 0,
    "shadows": 0
  },
  "muteSourceAudio": false,
  "trimInstructions": [
    {"clipIndex": 0, "trimStart": 0, "trimEnd": null},
    {"clipIndex": 1, "trimStart": 0, "trimEnd": null},
    {"clipIndex": 2, "trimStart": 0, "trimEnd": null},
    {"clipIndex": 3, "trimStart": 0, "trimEnd": null}
  ],
  "targetDuration": null
}

Valid transition types: "cut" "fade" "dissolve" "wipe-left" "wipe-right" "zoom-in" "zoom-out" "cross-zoom" "slide-left" "slide-right" "cinematic-fade" "glitch" "blur" "whip" "light-leak" "flash"`;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTransitionType(type: string | undefined, fallback: ValidTransition): ValidTransition {
  const normalized = (type ?? "").toLowerCase().trim().replace(/\s+/g, "-");
  return (VALID_TRANSITIONS as readonly string[]).includes(normalized) ? normalized as ValidTransition : fallback;
}

function normalizeColorAdjustments(value: Partial<EditPlan["globalColorAdjustments"]> | undefined) {
  const color = { ...DEFAULT_COLOR, ...(value ?? {}) };
  return {
    exposure: clamp(Number(color.exposure) || 0, -2, 2),
    contrast: clamp(Number(color.contrast) || 0, -100, 100),
    saturation: clamp(Number(color.saturation) || 0, -100, 100),
    temperature: clamp(Number(color.temperature) || 0, -100, 100),
    tint: clamp(Number(color.tint) || 0, -100, 100),
    highlights: clamp(Number(color.highlights) || 0, -100, 100),
    shadows: clamp(Number(color.shadows) || 0, -100, 100),
  };
}

interface ClipInfo {
  index: number;
  name: string;
  duration: number;
  frames?: string[]; // base64 JPEG data URLs for Gemini Vision
}

interface EditPlan {
  reasoning: string;
  sceneOrder: number[];
  trimInstructions: Array<{
    clipIndex: number;
    trimStart: number;
    trimEnd: number | null;
    note?: string;
  }>;
  transitions: Array<{
    afterClipIndex: number;
    type: string;
    duration: number;
  }>;
  globalColorAdjustments: {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    highlights: number;
    shadows: number;
  };
  captions: unknown[];
  targetDuration: number | null;
  muteSourceAudio?: boolean;
}

function defaultPlan(clips: ClipInfo[]): EditPlan {
  return {
    reasoning: "Using default ordering due to AI unavailability.",
    sceneOrder: clips.map(c => c.index),
    trimInstructions: clips.map(c => ({ clipIndex: c.index, trimStart: 0, trimEnd: null, note: "" })),
    transitions: clips.slice(0, -1).map(c => ({ afterClipIndex: c.index, type: "fade", duration: 0.5 })),
    globalColorAdjustments: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 },
    captions: [],
    targetDuration: null,
    muteSourceAudio: false,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, clips }: { prompt: string; clips: ClipInfo[] } = await req.json();

    if (!prompt || !clips?.length) {
      return NextResponse.json({ error: "prompt and clips are required" }, { status: 400 });
    }

    const requestedTransition = inferRequestedTransition(prompt);
    const requestedColor = inferRequestedColorAdjustments(prompt);
    const creativePrompt = stripDirectEditorControls(prompt) || "Arrange these clips into a cohesive, well-paced edit.";
    const clipList = clips
      .map(c => `  - Clip ${c.index}: "${c.name}" (${c.duration.toFixed(1)}s)`)
      .join("\n");

    // Build multimodal parts: text + image frames for each clip
    type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
    const userParts: GeminiPart[] = [];

    userParts.push({ text: `CREATIVE EDITING PROMPT: ${creativePrompt}

Transitions, numeric slider controls, and LUT/color presets have already been removed because the web editor applies them directly. Do not infer replacements for them.

UPLOADED CLIPS:
${clipList}

Total clips: ${clips.length}
Total footage duration: ${clips.reduce((s, c) => s + c.duration, 0).toFixed(1)}s

Below are sample frames from each clip so you can identify who is in them and what they look like:
` });

    for (const clip of clips) {
      if (clip.frames && clip.frames.length > 0) {
        userParts.push({ text: `\n--- Clip ${clip.index}: "${clip.name}" (${clip.duration.toFixed(1)}s) ---` });
        for (const frame of clip.frames) {
          const base64 = frame.replace(/^data:image\/\w+;base64,/, "");
          if (base64) {
            userParts.push({ inlineData: { mimeType: "image/jpeg", data: base64 } });
          }
        }
      }
    }

    userParts.push({ text: "\nNow return the JSON edit plan exactly as specified." });

    let plan: EditPlan;

    try {
      const response = await geminiRequest(MODEL, {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      });

      const raw = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
        ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      // Strip markdown fences if present
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
      plan = JSON.parse(cleaned) as EditPlan;

      // Ensure optional fields always exist before validating the AI response.
      if (plan.muteSourceAudio === undefined) {
        plan.muteSourceAudio = false;
      }
      plan.transitions = Array.isArray(plan.transitions) ? plan.transitions : [];
      plan.trimInstructions = Array.isArray(plan.trimInstructions) ? plan.trimInstructions : [];
      plan.globalColorAdjustments = normalizeColorAdjustments(plan.globalColorAdjustments);

      // Keep each valid clip exactly once, then append anything Gemini omitted.
      const inputIndices = new Set(clips.map(c => c.index));
      const seen = new Set<number>();
      plan.sceneOrder = (Array.isArray(plan.sceneOrder) ? plan.sceneOrder : [])
        .filter(i => inputIndices.has(i) && !seen.has(i) && seen.add(i));
      const outputIndices = new Set(plan.sceneOrder);
      const missing = [...inputIndices].filter(i => !outputIndices.has(i));
      if (missing.length) {
        plan.sceneOrder = [...plan.sceneOrder, ...missing];
      }

      const fallbackTransition = requestedTransition
        ?? normalizeTransitionType(plan.transitions[0]?.type, "cinematic-fade");
      const transitionByClip = new Map(
        plan.transitions.map(t => [
          t.afterClipIndex,
          {
            afterClipIndex: t.afterClipIndex,
            type: normalizeTransitionType(t.type, fallbackTransition),
            duration: clamp(Number(t.duration) || 0.8, 0.1, 2),
          },
        ])
      );

      // Rebuild boundaries in scene order so the prompt's transition cannot be lost,
      // duplicated, or attached to the wrong clip.
      plan.transitions = plan.sceneOrder.slice(0, -1).map(afterClipIndex => {
        const existing = transitionByClip.get(afterClipIndex);
        return {
          afterClipIndex,
          type: requestedTransition ?? existing?.type ?? fallbackTransition,
          duration: existing?.duration ?? 0.8,
        };
      });

      if (requestedColor) {
        plan.globalColorAdjustments = normalizeColorAdjustments({
          ...plan.globalColorAdjustments,
          ...requestedColor,
        });
      }
    } catch (aiErr) {
      console.error("[edit-footage] AI error, using default plan:", aiErr);
      plan = defaultPlan(clips);
      if (requestedTransition) {
        plan.transitions = plan.sceneOrder.slice(0, -1).map(afterClipIndex => ({
          afterClipIndex,
          type: requestedTransition,
          duration: 0.8,
        }));
      }
      if (requestedColor) {
        plan.globalColorAdjustments = normalizeColorAdjustments({ ...plan.globalColorAdjustments, ...requestedColor });
      }
    }

    return NextResponse.json({ success: true, plan });
  } catch (err) {
    console.error("[edit-footage] route error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
