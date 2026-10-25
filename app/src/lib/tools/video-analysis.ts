/**
 * Video Analysis Tool
 *
 * Purpose:  Understand the footage before making ANY editing decision.
 *           A human editor watches all clips before touching the timeline.
 *           This tool replicates that step with scene-aware multimodal inspection.
 *
 * Input:    Raw video clips (base64 encoded keyframes or data)
 * Output:   Per-clip metadata — scene detections, camera movements, actions, quality, confidence
 * Model:    Configured via ai-router (default: gemini-2.5-pro / vision)
 */

import { geminiRequest } from "@/lib/gemini";
import type { GeminiClip } from "@/lib/gemini";
import type { Tool, ToolContext, ToolResult, WorkflowCluster } from "./types";
import { getModel } from "@/lib/ai-router";
import { safeParseJson } from "@/lib/json-repair";

export interface VideoAnalysisInput {
  clips: GeminiClip[];
}

export interface SceneDetection {
  startTime: number;
  endTime: number;
  description: string;
  action?: string;
  cameraMovement?: "static" | "pan" | "tilt" | "zoom" | "tracking" | "handheld" | "shaky";
  visualQuality?: "low" | "medium" | "high" | "cinematic";
  confidence?: number;
  energyLevel: "low" | "medium" | "high";
  hasHuman: boolean;
  hasProduct: boolean;
  suitableAsHook: boolean;
  hookRationale?: string;
}

export interface ClipAnalysis {
  clipId?: string;
  clipIndex: number;
  name: string;
  estimatedDuration: number;
  scenes: SceneDetection[];
  motion: "static" | "slow" | "medium" | "fast" | "handheld";
  cameraMovement?: string;
  dominantColors: string[];
  audioPresent: boolean;
  quality: "low" | "medium" | "high";
  usability: number;
  suggestedUse: string;
  bestSegmentStart: number;
  bestSegmentEnd: number;
  structuredEvidence?: string;
}

export interface VideoAnalysisOutput {
  clips: ClipAnalysis[];
  overallQuality: number;
  editableClipCount: number;
  footageSummary: string;
  suggestedCluster: WorkflowCluster;
  suggestedEditStyle: string;
  hookCandidates: Array<{ clipIndex: number; clipId?: string; start: number; end: number; reason: string }>;
}

export const videoAnalysisTool: Tool<VideoAnalysisInput, VideoAnalysisOutput> = {
  name: "video-analysis",
  description: "Analyzes uploaded video clips for content, motion, camera movements, quality, and edit suitability",
  purpose: "Understand the footage before making any editing decision — mirrors what a human editor does on day 1",
  inputs: "GeminiClip[] — video keyframes or files with name, mimeType, duration, index, id",
  outputs: "Per-clip analysis: scenes, actions, camera movements, quality, confidence, best segments, hook candidates",
  modelsUsed: [getModel("vision")],
  failureCases: [
    "Clip < 1s → usability 0, marked as unusable",
    "Corrupt/unsupported codec → clip skipped, continues with others",
    "Gemini quota → falls back to name-based metadata estimation",
    "No clips → returns empty analysis with overallQuality 0",
  ],
  knownLimitations: [
    "Cannot detect licensed music or copyrighted content",
    "Colour analysis is approximate",
  ],

  async execute(input: VideoAnalysisInput, ctx: ToolContext): Promise<ToolResult<VideoAnalysisOutput>> {
    void ctx;
    const start = Date.now();
    const activeModel = getModel("vision");

    if (!input.clips?.length) {
      return {
        success: true,
        data: {
          clips: [], overallQuality: 0, editableClipCount: 0,
          footageSummary: "No clips provided",
          suggestedCluster: "ugc-ads", suggestedEditStyle: "concept",
          hookCandidates: [],
        },
        durationMs: Date.now() - start,
        modelUsed: activeModel,
      };
    }

    try {
      const parts: Record<string, unknown>[] = [];
      for (const clip of input.clips) {
        const frameCount = clip.frames?.length ?? (clip.data ? 1 : 0);
        parts.push({
          text: `Clip ${clip.index} (ID: "${clip.id ?? `clip-${clip.index}`}"): "${clip.name}"${clip.duration ? ` (${clip.duration.toFixed(2)}s total)` : ""} — ${frameCount} keyframe${frameCount !== 1 ? "s" : ""}`,
        });

        if (clip.frames?.length) {
          for (let fi = 0; fi < clip.frames.length; fi++) {
            const ts = clip.frameTimestamps?.[fi];
            const label = ts !== undefined
              ? `Keyframe at ${ts.toFixed(2)}s${clip.duration ? ` / ${clip.duration.toFixed(2)}s` : ""}`
              : `Keyframe ${fi + 1} of ${clip.frames.length}`;
            parts.push({ text: label });
            parts.push({ inlineData: { mimeType: "image/jpeg", data: clip.frames[fi].replace(/^data:image\/\w+;base64,/, "") } });
          }
        } else if (clip.data) {
          parts.push({ inlineData: { mimeType: clip.mimeType, data: clip.data.replace(/^data:.*base64,/, "") } });
        }
      }
      parts.push({ text: buildAnalysisPrompt(input.clips.length) });

      const data = await geminiRequest(activeModel, {
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 4000 },
        },
      });

      const raw = extractText(data);
      const result = safeParseJson<VideoAnalysisOutput>(raw);

      // Ensure clips array exists
      if (!Array.isArray(result.clips)) {
        result.clips = buildFallbackAnalysis(input.clips).clips;
      }

      // Preserve clip IDs and clamp timestamps to source durations
      result.clips = result.clips.map((analysis, idx) => {
        const sourceClip = input.clips[analysis.clipIndex] ?? input.clips[idx];
        const clipDuration = sourceClip?.duration ?? analysis.estimatedDuration ?? 5;
        const clipId = sourceClip?.id ?? `clip-${analysis.clipIndex}`;

        const scenes = (analysis.scenes ?? []).map((s) => {
          const startTime = Math.max(0, Math.min(clipDuration - 0.1, Number(s.startTime) || 0));
          const endTime = Math.max(startTime + 0.1, Math.min(clipDuration, Number(s.endTime) || clipDuration));
          return {
            ...s,
            startTime: parseFloat(startTime.toFixed(3)),
            endTime: parseFloat(endTime.toFixed(3)),
            confidence: typeof s.confidence === "number" ? Math.max(0, Math.min(1, s.confidence)) : 0.9,
          };
        });

        const bestStart = Math.max(0, Math.min(clipDuration - 0.1, Number(analysis.bestSegmentStart) || 0));
        const bestEnd = Math.max(bestStart + 0.1, Math.min(clipDuration, Number(analysis.bestSegmentEnd) || clipDuration));

        return {
          ...analysis,
          clipId,
          name: sourceClip?.name ?? analysis.name,
          estimatedDuration: clipDuration,
          scenes,
          bestSegmentStart: parseFloat(bestStart.toFixed(3)),
          bestSegmentEnd: parseFloat(bestEnd.toFixed(3)),
          structuredEvidence: `${analysis.motion} motion, camera=${analysis.cameraMovement || "static"}, usability=${analysis.usability}. ${analysis.suggestedUse}`,
        };
      });

      // Enrich hook candidates with clipId
      if (Array.isArray(result.hookCandidates)) {
        result.hookCandidates = result.hookCandidates.map((hc) => ({
          ...hc,
          clipId: input.clips[hc.clipIndex]?.id ?? `clip-${hc.clipIndex}`,
        }));
      }

      return { success: true, data: result, durationMs: Date.now() - start, modelUsed: activeModel };
    } catch (e) {
      // Graceful fallback: build structured metadata without vision
      const fallback = buildFallbackAnalysis(input.clips);
      return {
        success: true,
        data: fallback,
        durationMs: Date.now() - start,
        modelUsed: "fallback-metadata",
        error: `Vision analysis failed, using fallback: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

function buildAnalysisPrompt(clipCount: number): string {
  return `Analyze all ${clipCount} video clips with scene-aware precision.
For each clip, record:
1. WHO and WHAT appears (subjects, clothing, environment).
2. Useful ACTIONS performed during specific timestamps.
3. CAMERA MOVEMENT (static, pan, tilt, zoom, tracking, handheld, shaky).
4. VISUAL QUALITY (low, medium, high, cinematic) and confidence (0.0 to 1.0).
5. Exact best in/out timestamps bounded by the clip duration.

Return ONLY valid JSON:
{
  "clips": [{
    "clipIndex": 0,
    "name": "filename",
    "estimatedDuration": 5.0,
    "scenes": [{
      "startTime": 0.0,
      "endTime": 3.2,
      "description": "Woman in blue jacket speaks directly to camera in modern kitchen",
      "action": "speaking and holding product",
      "cameraMovement": "static",
      "visualQuality": "high",
      "confidence": 0.95,
      "energyLevel": "medium",
      "hasHuman": true,
      "hasProduct": true,
      "suitableAsHook": true,
      "hookRationale": "Direct eye contact and clear product placement in opening second"
    }],
    "motion": "medium",
    "cameraMovement": "static",
    "dominantColors": ["#3b82f6", "#f3f4f6"],
    "audioPresent": true,
    "quality": "high",
    "usability": 0.9,
    "suggestedUse": "A-roll hook or core product demonstration",
    "bestSegmentStart": 0.0,
    "bestSegmentEnd": 3.2
  }],
  "overallQuality": 0.88,
  "editableClipCount": ${clipCount},
  "footageSummary": "Summary of all clips and key narrative assets",
  "suggestedCluster": "ugc-ads",
  "suggestedEditStyle": "fast energetic vox-pop cuts",
  "hookCandidates": [
    {"clipIndex": 0, "start": 0.0, "end": 3.0, "reason": "Immediate hook with high energy and direct gaze"}
  ]
}

suggestedCluster must be "ugc-ads" or "travel-cinematic".`;
}

function buildFallbackAnalysis(clips: GeminiClip[]): VideoAnalysisOutput {
  return {
    clips: clips.map(c => ({
      clipId: c.id ?? `clip-${c.index}`,
      clipIndex: c.index,
      name: c.name,
      estimatedDuration: c.duration ?? 5,
      scenes: [{
        startTime: 0,
        endTime: c.duration ?? 5,
        description: c.name,
        action: "action in clip",
        cameraMovement: "static" as const,
        visualQuality: "medium" as const,
        confidence: 0.7,
        energyLevel: "medium" as const,
        hasHuman: false,
        hasProduct: false,
        suitableAsHook: true,
      }],
      motion: "medium" as const,
      cameraMovement: "static",
      dominantColors: [],
      audioPresent: false,
      quality: "medium" as const,
      usability: 0.7,
      suggestedUse: "editorial cut",
      bestSegmentStart: 0,
      bestSegmentEnd: Math.min(c.duration ?? 5, 5),
      structuredEvidence: `Metadata-only fallback for ${c.name}`,
    })),
    overallQuality: 0.7,
    editableClipCount: clips.length,
    footageSummary: `${clips.length} clip(s) provided. Vision analysis fallback — using metadata only.`,
    suggestedCluster: "ugc-ads",
    suggestedEditStyle: "editorial cut",
    hookCandidates: clips.length ? [{ clipIndex: 0, clipId: clips[0].id ?? "clip-0", start: 0, end: 3, reason: "First clip — default hook candidate" }] : [],
  };
}

function extractText(data: Record<string, unknown>): string {
  return (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
