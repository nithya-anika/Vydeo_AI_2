/**
 * Timeline Generator Tool
 *
 * Purpose:  Generate the full timeline JSON from a brief + analysis context.
 *           Cluster-aware: UGC/Ads uses fast-paced cuts; Travel uses cinematic pacing.
 *           Mode-aware: Editorial assembles from clips; Concept writes directions.
 *
 * Input:    Brief, brand context, cluster config, hook result, clip analysis
 * Output:   Full Timeline JSON + clip assignments + editorial suggestions
 * Models:   editorial → gemini-2.5-pro (multimodal); concept → gemini-2.5-flash
 *
 * Failure cases:
 *   - Empty scenes returned → caller falls back to demo lineup
 *   - Duration mismatch > 20% → logged as QA issue, not fatal
 */

import { geminiRequest, validateAndSanitizeLineup } from "@/lib/gemini";
import type { GeminiClip, ClipAssignment, BrandOverrides } from "@/lib/gemini";
import type { BrandWorkspace } from "@/types/brand";
import type { Timeline, LineupResponse } from "@/types/timeline";
import type { Tool, ToolContext, ToolResult } from "./types";
import type { HookDetectionOutput } from "./hook-detection";
import type { VideoAnalysisOutput } from "./video-analysis";
import { getModel } from "@/lib/ai-router";
import { safeParseJson } from "@/lib/json-repair";
import { snapTrimToSpeechBoundaries } from "@/lib/transcription";
import {
  buildCandidateSegmentInventory,
  resolveSelectedCandidatesToScenes,
  type SelectedCandidateOrder,
} from "@/lib/candidateInventory";

export interface TimelineGeneratorInput {
  prompt: string;
  brand: BrandWorkspace;
  aspectRatio?: string;
  overrides?: BrandOverrides;
  clips?: GeminiClip[];
  hookResult?: HookDetectionOutput;
  videoAnalysis?: VideoAnalysisOutput;
  clusterConfig: ClusterConfig;
  pastExamples?: string;
  classification: {
    cluster: string;
    mode: string;
    intent: string;
    tone: string;
    platform: string;
  };
}

export interface ClusterConfig {
  clusterId: string;
  pacingStyle: "fast-cuts" | "medium-paced" | "cinematic-slow";
  defaultTransitions: string[];
  captionStyle: "punchy" | "storytelling" | "minimal";
  colorGradeDefault: string;
  sceneCountRange: [number, number];
  systemPrompt: string;
}

export interface TimelineGeneratorOutput {
  timeline: Timeline;
  suggestions?: LineupResponse["suggestions"];
  clipAssignments: ClipAssignment[];
  generationNotes: string;
}

export const timelineGeneratorTool: Tool<TimelineGeneratorInput, TimelineGeneratorOutput> = {
  name: "timeline-generator",
  description: "Generates the complete timeline JSON using cluster-specific prompts and multi-model routing",
  purpose: "Produce an edit plan that matches professional output for the target cluster and platform",
  inputs: "Brief, brand workspace, cluster config, hook result, video analysis, past examples",
  outputs: "Timeline JSON, clip assignments, editorial suggestions, generation notes",
  modelsUsed: [getModel("storyboard"), getModel("planning")],
  failureCases: [
    "Empty scenes → caller falls back to demo lineup",
    "Duration mismatch >20% → QA issue logged",
    "JSON parse failure → retry with stricter prompt",
  ],
  knownLimitations: [
    "Cannot access external references or style videos",
    "Clip trim precision is limited by model token window",
    "Very long targets (>120s) may produce uneven scene distribution",
  ],

  async execute(input: TimelineGeneratorInput, ctx: ToolContext): Promise<ToolResult<TimelineGeneratorOutput>> {
    void ctx;
    const start = Date.now();
    const model = input.clips?.length ? getModel("storyboard") : getModel("planning");

    try {
      const ratio = input.aspectRatio ?? input.brand.defaultAspectRatio;
      const overrideLines = buildOverrideLines(input.overrides);
      const hookSection = input.hookResult
        ? `HOOK GUIDANCE:\n  Strategy: ${input.hookResult.hookStrategy}\n  Opening clip: ${input.hookResult.recommendedHook.clipIndex ?? "concept"} @ ${input.hookResult.recommendedHook.trimStart}s–${input.hookResult.recommendedHook.trimEnd}s\n  Caption: "${input.hookResult.recommendedHook.captionSuggestion}"\n`
        : "";
      if (input.clips?.length) {
        return await generateEditorial(input, model, ratio, overrideLines, hookSection, start);
      } else {
        return await generateConcept(input, model, ratio, overrideLines, hookSection, start);
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
    }
  },
};

async function generateConcept(
  input: TimelineGeneratorInput,
  model: string,
  ratio: string,
  overrideLines: string,
  hookSection: string,
  start: number,
): Promise<ToolResult<TimelineGeneratorOutput>> {
  const { sceneCountRange, pacingStyle, defaultTransitions, captionStyle, colorGradeDefault } = input.clusterConfig;
  const pastSection = input.pastExamples
    ? `\nSUCCESSFUL PAST EXAMPLES (match this quality):\n${input.pastExamples}\n`
    : "";

  const prompt = `${input.clusterConfig.systemPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER'S EXACT REQUEST (follow this precisely):
${input.prompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every scene description, caption, and structural choice MUST directly reflect the brief above.
Do not generate generic content. If the brief mentions specific products, tones, actions, or styles — they MUST appear in the output.
Make the video feel interactive, premium, and word-rich where useful: include tasteful on-screen text, app UI words, labels, feedback states, score changes, button taps, chat bubbles, and benefit callouts.
Transitions and caption timing must be synchronized to the expected music beat, voiceover phrases, taps/clicks, camera movement, and emotional changes.
Target 10/10 ad quality: strong opening hook, clear product value, polished pacing, no filler, no dead moments, no unsynced transitions.
BRAND: ${input.brand.name}
Style keywords: ${input.brand.styleKeywords.join(", ")}
Prohibited: ${input.brand.prohibitedElements.join(", ")}
Aspect ratio: ${ratio}
Color grade: ${input.overrides?.colorGrade ?? colorGradeDefault ?? input.brand.colorGrade.name}
Caption position: ${input.brand.captionStyle.position}, max ${input.brand.captionStyle.maxCharsPerLine} chars/line
${overrideLines}
CLUSTER DEFAULTS (starting point only — the brief above overrides these):
  Style: ${pacingStyle} | Transitions: ${defaultTransitions.join(", ")} | Captions: ${captionStyle}
  Typical range: ${sceneCountRange[0]}–${sceneCountRange[1]} scenes — use only as many as the brief ACTUALLY needs

BRIEF-DRIVEN PACING (derive from the brief above, not the defaults):
  - slow / cinematic / atmospheric / narrative brief → scenes 4-8s, let shots breathe, fewer cuts
  - fast / energetic / punchy / ad / reel brief → scenes 2-4s, snappy cuts
  - neutral brief → apply ${pacingStyle} default
  - NEVER add scenes just to fill a range. Fewer intentional scenes beats more generic ones.
  - Each scene must serve a distinct, specific purpose from the brief.

CLASSIFIED INTENT: ${input.classification.intent}
TONE: ${input.classification.tone} | PLATFORM: ${input.classification.platform}

${hookSection}${pastSection}

Generate DIRECTORIAL scene descriptions that directly serve the brief.
Each scene description must be specific: camera angle, subject, action, lighting — not generic.

Return ONLY this JSON:
{
  "timeline": {
    "id": "<uuid>", "title": "<title>", "brandWorkspaceId": "${input.brand.id}",
    "createdAt": "<ISO>", "updatedAt": "<ISO>",
    "totalDuration": <number>, "aspectRatio": "${ratio}",
    "targetPlatform": "${input.classification.platform}",
    "scenes": [{
      "id": "<uuid>", "order": 0, "label": "<scene name>",
      "description": "<DIRECTORIAL: exact shot — camera angle, subject, action, lighting>",
      "duration": <sec>,
      "transition": {"type": "<${defaultTransitions[0]}>", "duration": 0.5},
      "captions": [{"id":"<uuid>","text":"<${captionStyle === "punchy" ? "SHORT PUNCHY CAPS" : "narrative caption"}>","startTime":0,"endTime":2,"style":"brand-default"}],
      "overlays": [], "motionStyle": "<slow-pan|ken-burns|static>", "mood": "${input.classification.tone}"
    }],
    "audioLayers": [{"id":"<uuid>","type":"bgm","startTime":0,"endTime":<total>,"volume":0.6,"fadeIn":1,"fadeOut":2}],
    "globalColorGrade": "${input.overrides?.colorGrade ?? colorGradeDefault ?? input.brand.colorGrade.name}",
    "meta": {"generatedBy":"${model}","promptUsed":"${input.prompt.replace(/"/g, "'")}","brandWorkspaceId":"${input.brand.id}","version":1,"cluster":"${input.clusterConfig.clusterId}"},
    "isLocked": false
  },
  "clipAssignments": [],
  "suggestions": {
    "captionTiming": "...", "transitionRationale": "...", "brandNotes": "...", "improvements": []
  }
}`;

  const data = await geminiRequest(model, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 2048 },
      responseSchema: {
        type: "OBJECT",
        properties: {
          timeline: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              aspectRatio: { type: "STRING" },
              targetPlatform: { type: "STRING" },
              selectedCandidates: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    candidateId: { type: "STRING" },
                    role: { type: "STRING" },
                    label: { type: "STRING" },
                    captionText: { type: "STRING" },
                    transitionType: { type: "STRING" },
                    playbackSpeed: { type: "NUMBER" },
                    customTrimStart: { type: "NUMBER" },
                    customTrimEnd: { type: "NUMBER" }
                  },
                  required: ["candidateId", "role", "transitionType", "playbackSpeed"]
                }
              }
            },
            required: ["title", "selectedCandidates"]
          },
          suggestions: {
            type: "OBJECT",
            properties: {
              captionTiming: { type: "STRING" },
              transitionRationale: { type: "STRING" },
              brandNotes: { type: "STRING" },
              improvements: { type: "ARRAY", items: { type: "STRING" } }
            }
          }
        },
        required: ["timeline", "suggestions"]
      }
    },
  });

  const raw = extractText(data);
  const parsed = safeParseJson<Record<string, unknown>>(raw);
  const sanitized = validateAndSanitizeLineup(parsed, input.brand, input.aspectRatio);

  return {
    success: true,
    data: {
      timeline: sanitized.timeline,
      suggestions: sanitized.suggestions,
      clipAssignments: [],
      generationNotes: `Concept mode — ${sanitized.timeline.scenes?.length ?? 0} scenes at ${model}`,
    },
    durationMs: Date.now() - start,
    modelUsed: model,
  };
}

async function generateEditorial(
  input: TimelineGeneratorInput,
  model: string,
  ratio: string,
  overrideLines: string,
  hookSection: string,
  start: number,
): Promise<ToolResult<TimelineGeneratorOutput>> {
  const clips = input.clips!;
  const candidateInventory = buildCandidateSegmentInventory(clips, input.videoAnalysis);
  const { pacingStyle, defaultTransitions, captionStyle, colorGradeDefault } = input.clusterConfig;

  const candidateList = candidateInventory.candidates.map(c =>
    `  [${c.candidateId}] Clip ${c.clipIndex} ("${c.clipName}"): ${c.sourceTrimStart}s–${c.sourceTrimEnd}s (${c.duration}s)
     - Visual: "${c.visualDescription}" (action: "${c.action}", camera: ${c.cameraMovement}, quality: ${c.visualQuality}, conf: ${c.confidence})
     ${c.speechText ? `- Dialogue: "${c.speechText}"` : "- Audio: B-roll / ambient sound"}
     ${c.suitableAsHook ? `- HOOK SUITABLE: ${c.hookRationale || "High visual impact opening"}` : ""}`
  ).join("\n\n");

  const clipList = clips.map(c => {
    let str = `  Clip ${c.index} (ID: "${c.id ?? `clip-${c.index}`}"): "${c.name}"${c.duration ? ` (${c.duration.toFixed(2)}s — clipTrimEnd max: ${c.duration.toFixed(2)})` : ""}`;
    if (c.speechSegments && c.speechSegments.length > 0) {
      str += `\n    Audio / Spoken Transcript:\n` + c.speechSegments.map(s => `      [${s.startTime.toFixed(2)}s - ${s.endTime.toFixed(2)}s]: "${s.text}"`).join("\n");
    } else if (c.transcript) {
      str += `\n    Transcript: "${c.transcript}"`;
    }
    return str;
  }).join("\n\n");

  const analysisSummary = input.videoAnalysis?.clips?.length
    ? `\nSCENE & MOTION ANALYSIS (with camera movements and actions):\n${input.videoAnalysis.clips.map(c => {
        const sceneDescs = c.scenes?.map(s => `[${s.startTime}s-${s.endTime}s: "${s.description}", action: "${s.action || "none"}", camera: ${s.cameraMovement || "static"}, conf: ${s.confidence ?? 0.9}]`).join("; ") ?? "";
        return `  Clip ${c.clipIndex} (ID: "${c.clipId ?? `clip-${c.clipIndex}`}"): ${sceneDescs || c.suggestedUse}\n    → Evidence: ${c.structuredEvidence || c.suggestedUse}`;
      }).join("\n")}\n\nFOOTAGE OVERVIEW: ${input.videoAnalysis.footageSummary ?? ""}\n`
    : "";

  const prompt = `You are a professional video editor. Select and sequence the best candidate media segments to fulfill the brief.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER'S EXACT REQUEST — the only authority:
${input.prompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CANDIDATE SEGMENT INVENTORY (Pre-verified media segments with exact source boundaries):
${candidateList}

EDITORIAL RULES & SELECTION:
1. SELECT BY CANDIDATE ID & OMISSIONS:
   - Select candidate IDs from the CANDIDATE SEGMENT INVENTORY above.
   - EXTREME WARNING ON OMISSIONS: Look closely at the Brief's TRIMMING DIRECTIVES or MUST NOT section. If it says to OMIT a clip (e.g. "omit Clip 3", "omit Clip 4"), YOU MUST NEVER output a scene using that clip index. Double check your output before responding.
   - Otherwise, YOU MUST ATTEMPT TO INCLUDE AT LEAST ONE SEGMENT FROM EVERY SOURCE CLIP to tell a complete story.
2. ORDERING & NARRATIVE STRUCTURE:
   - EXTREME WARNING ON ORDER: If the brief specifies an EXACT sequence or ordering of clips by their filenames (e.g. "alternate rapidly between IMG_1024, IMG_1025...", "sequence chronologically"), YOU MUST OUTPUT THE SCENES IN THAT EXACT ORDER matching the specific file names. Do not invent your own structure if the brief has done the math.
   - Hook candidates belong at the start (scene 0) UNLESS the brief explicitly tells you to start with a specific clip name (e.g. "open with IMG_7372").
   - Sequence candidates to build natural rhythm, progression, and a clear call-to-action payoff.
3. AUDIO & SPEECH CONTINUITY:
   - NEVER cut a person off mid-sentence. If someone is speaking, you MUST align your "customTrimStart" and "customTrimEnd" timestamps with the natural pauses in the Spoken Transcript provided in the inventory.
   - B-roll / silence candidates can be cut shorter or used as cutaways.
4. TRANSITIONS & PACING:
   - Match pacing to the brief: fast-paced = sharp cuts; cinematic = smooth dissolves/fades; talking-head = clean cuts.
   - Do NOT force every cut to a beat. Use transitions purposefully. Default to "cut" when in doubt.
5. TRIMMING & EXACT TIMESTAMPS (CRITICAL):
   - If the Brief provides EXACT timestamps for a clip (e.g., "Keep from 0.44s to 27.10s", "Trim 0:00 to 0:04"), YOU MUST USE EXACTLY THOSE TIMESTAMPS for "customTrimStart" and "customTrimEnd". Do not invent your own cuts if the Brief has already done the math.
   - If no exact timestamps are provided, you MUST proactively use "customTrimStart" and "customTrimEnd" to remove 'dead space', 'setup time', and 'trails'.
   - Example: to select the best 4 seconds of a 10s candidate, provide:
     "customTrimStart": 2.0, "customTrimEnd": 6.0

BRAND: ${input.brand.name} | Aspect ratio: ${ratio} | Color grade: ${input.overrides?.colorGrade ?? colorGradeDefault ?? input.brand.colorGrade.name}
Captions: ${input.brand.captionStyle.position}, max ${input.brand.captionStyle.maxCharsPerLine} chars/line
${overrideLines}
TONE: ${input.classification.tone} | PLATFORM: ${input.classification.platform}
${hookSection}

Return ONLY this JSON schema with "selectedCandidates" specifying the ordered sequence:
{
  "timeline": {
    "title":"<title>",
    "aspectRatio":"${ratio}",
    "targetPlatform":"${input.classification.platform}",
    "selectedCandidates": [
      {
        "candidateId": "cand_c0_s0",
        "role": "hook",
        "label": "<brief description>",
        "captionText": "<punchy on-screen caption>",
        "transitionType": "cut",
        "playbackSpeed": 1.0,
        "customTrimStart": 0.0,
        "customTrimEnd": 4.5
      }
    ]
  },
  "clipAssignments":[{"sceneId":"<uuid>","clipIndex":0,"trimStart":0,"trimEnd":5.0}],
  "suggestions":{"captionTiming":"...","transitionRationale":"...","brandNotes":"...","improvements":[]}
}`;

  const parts: Record<string, unknown>[] = [];
  for (const clip of clips) {
    parts.push({ text: `Clip ${clip.index} (Name: "${clip.name}")${clip.duration ? ` (${clip.duration.toFixed(1)}s total)` : ""}
[NOTE: When referencing this clip, you must output candidates matching "clipIndex": ${clip.index}]` });
    if (clip.frames?.length) {
      for (let fi = 0; fi < clip.frames.length; fi++) {
        const ts = clip.frameTimestamps?.[fi];
        const label = ts !== undefined
          ? `Frame at ${ts.toFixed(1)}s${clip.duration ? ` / ${clip.duration.toFixed(1)}s` : ""}`
          : `Frame ${fi + 1} of ${clip.frames.length}`;
        parts.push({ text: label });
        parts.push({ inlineData: { mimeType: "image/jpeg", data: clip.frames[fi].replace(/^data:image\/\w+;base64,/, "") } });
      }
    } else if (clip.data) {
      parts.push({ inlineData: { mimeType: clip.mimeType, data: clip.data.replace(/^data:.*base64,/, "") } });
    }
  }
  parts.push({ text: prompt });

  const data = await geminiRequest(model, {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 2048 },
    },
  });

  const raw = extractText(data);
  const parsed = safeParseJson<Record<string, unknown>>(raw);

  const parsedTimeline = (parsed.timeline ?? {}) as Record<string, unknown>;
  const rawSelections = (parsedTimeline.selectedCandidates ?? parsed.selectedCandidates) as SelectedCandidateOrder[] | undefined;

  let clipAssignments: ClipAssignment[] = Array.isArray(parsed.clipAssignments)
    ? (parsed.clipAssignments as ClipAssignment[])
    : [];

  const sanitized = validateAndSanitizeLineup(parsed, input.brand, input.aspectRatio);

  // Candidate-based deterministic resolution: map selected candidate IDs to exact media bounds
  if (Array.isArray(rawSelections) && rawSelections.length > 0) {
    const resolved = resolveSelectedCandidatesToScenes({
      selections: rawSelections,
      inventory: candidateInventory,
      clips,
      brand: input.brand,
      aspectRatio: ratio,
      targetDuration: sanitized.timeline.totalDuration,
    });

    if (resolved.scenes.length > 0) {
      sanitized.timeline.scenes = resolved.scenes;
      clipAssignments = resolved.clipAssignments;
      sanitized.timeline.totalDuration = resolved.totalDuration;
    }
  } else if (clipAssignments.length && sanitized.timeline.scenes?.length) {
    sanitized.timeline.scenes = sanitized.timeline.scenes.map((scene, idx) => {
      const a = clipAssignments.find(ca => ca.sceneId === scene.id)
        ?? (idx < clipAssignments.length ? clipAssignments[idx] : undefined);
      const clipIndex = a?.clipIndex ?? (scene as any).clipIndex ?? -1;
      const sourceClip = clipIndex >= 0 && clipIndex < clips.length ? clips[clipIndex] : undefined;
      let trimStart = a?.trimStart ?? scene.clipTrimStart ?? 0;
      let trimEnd = a?.trimEnd ?? scene.clipTrimEnd ?? sourceClip?.duration;

      // Audio-aware trimming: align trims to natural sentence and speech pauses
      if (sourceClip?.speechSegments?.length && sourceClip.duration) {
        const snapped = snapTrimToSpeechBoundaries(
          trimStart,
          trimEnd ?? sourceClip.duration,
          sourceClip.speechSegments,
          sourceClip.duration
        );
        trimStart = snapped.trimStart;
        trimEnd = snapped.trimEnd;
      }

      const speed = scene.playbackSpeed ?? 1.0;
      const dur = trimEnd != null && trimEnd > trimStart
        ? parseFloat(((trimEnd - trimStart) / speed).toFixed(3))
        : scene.duration;

      return {
        ...scene,
        clipSrc: scene.clipSrc || sourceClip?.src || undefined,
        clipType: scene.clipType || (sourceClip?.mimeType?.startsWith("image") ? "image" : "video"),
        clipTrimStart: trimStart,
        clipTrimEnd: trimEnd,
        duration: Math.max(0.5, dur),
      };
    });
  }

  return {
    success: true,
    data: {
      timeline: sanitized.timeline,
      suggestions: sanitized.suggestions,
      clipAssignments,
      generationNotes: `Editorial mode — ${sanitized.timeline.scenes?.length ?? 0} scenes from ${clips.length} clips at ${model}`,
    },
    durationMs: Date.now() - start,
    modelUsed: model,
  };
}

function buildOverrideLines(overrides?: BrandOverrides): string {
  if (!overrides) return "";
  const lines = [
    overrides.primaryColor && `Primary color override: ${overrides.primaryColor}`,
    overrides.fontFamily   && `Font override: ${overrides.fontFamily}`,
    overrides.logoPosition && `Logo position override: ${overrides.logoPosition}`,
    overrides.colorGrade   && `Color grade override: ${overrides.colorGrade}`,
  ].filter(Boolean);
  return lines.length ? `BRAND OVERRIDES:\n${lines.join("\n")}` : "";
}

function extractText(data: Record<string, unknown>): string {
  return (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
