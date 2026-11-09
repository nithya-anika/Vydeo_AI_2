import { v4 as uuidv4 } from "uuid";
import type { Scene as StoreScene, Transition as StoreTransition, TransitionType as StoreTransitionType } from "@/store/editorStore";
import {
  FOOTAGE_TRANSITION_TYPES,
  inferRequestedColorAdjustments,
  inferRequestedColorGrade,
  inferRequestedTransition,
  inferRequestedSpeed,
  type FootageTransitionType,
} from "./footagePromptControls";

export interface UploadedClip {
  id: string;
  name: string;
  file?: File;
  src: string;
  duration: number;
  width?: number;
  height?: number;
  thumbnail: string;
  frames?: string[];
  speechSegments?: { text: string; startTime: number; endTime: number }[];
  transcript?: string;
  silenceWindows?: { start: number; end: number; duration: number }[];
  transcriptionStatus?: "pending" | "completed_with_speech" | "completed_no_speech" | "failed";
}

export interface EditPlan {
  reasoning?: string;
  sceneOrder?: number[];
  transitions?: Array<{
    afterClipIndex: number;
    type: string;
    duration: number;
  }>;
  globalColorAdjustments?: {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    highlights: number;
    shadows: number;
  };
  targetDuration?: number | null;
  muteSourceAudio?: boolean;
  trimInstructions?: Array<{
    clipIndex: number;
    trimStart: number;
    trimEnd: number | null;
    note?: string;
  }>;
}

const VALID_TRANSITIONS = new Set<string>(FOOTAGE_TRANSITION_TYPES);

const DEFAULT_ADJ = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
};

/**
 * Editorial duration budgeting.
 * Distributes the available target duration based on narrative role and editorial priority:
 * - Opening hook (scene 0) maintains strong punch (min 2.0s - 3.5s).
 * - Closing scene / CTA maintains clarity (min 2.0s - 3.0s).
 * - Middle scenes are trimmed progressively from their tails (shaving lulls).
 * - If footage vastly exceeds target duration, low-priority scenes are pruned.
 * - Never crushes all scenes into a uniform fraction.
 */
export function budgetEditorialDurations(
  naturalDurations: number[],
  targetDuration: number,
  minSceneFloor = 1.0
): number[] {
  const count = naturalDurations.length;
  if (count === 0) return [];
  if (targetDuration <= 0) return naturalDurations.map((d) => parseFloat(d.toFixed(3)));

  const totalNatural = naturalDurations.reduce((sum, d) => sum + d, 0);
  if (totalNatural <= targetDuration) {
    return naturalDurations.map((d) => parseFloat(d.toFixed(3)));
  }

  // If even minimal scenes cannot fit, keep only as many scenes as can comfortably fit
  const absoluteMin = Math.min(minSceneFloor, targetDuration / count);
  let activeIndices = naturalDurations.map((_, i) => i);

  // If too many scenes to fit comfortably (each scene would be under 1s), prioritize hook, middle, and outro
  if (count * minSceneFloor > targetDuration && count > 3) {
    const maxScenesToKeep = Math.max(2, Math.floor(targetDuration / minSceneFloor));
    if (maxScenesToKeep < count) {
      // Keep scene 0 (hook), last scene (CTA), and evenly sampled middle scenes
      const kept = new Set<number>([0, count - 1]);
      const step = (count - 1) / (maxScenesToKeep - 1);
      for (let i = 1; i < maxScenesToKeep - 1; i++) {
        kept.add(Math.round(i * step));
      }
      activeIndices = Array.from(kept).sort((a, b) => a - b);
    }
  }

  // Start with full natural durations for active scenes
  const durations = naturalDurations.map((d, i) => (activeIndices.includes(i) ? d : 0));
  let currentTotal = durations.reduce((sum, d) => sum + d, 0);
  let excess = currentTotal - targetDuration;

  // Progressive tail trimming: iteratively shave excess from longest scenes first
  let iterations = 0;
  while (excess > 0.05 && iterations < 50) {
    iterations++;
    const activeWithRoom = activeIndices.filter((idx) => {
      // Scene 0 hook protected floor: 2.0s (or natural)
      const floor = idx === 0
        ? Math.min(durations[idx], Math.max(absoluteMin, 2.0))
        : idx === count - 1
        ? Math.min(durations[idx], Math.max(absoluteMin, 1.8))
        : absoluteMin;
      return durations[idx] > floor;
    });

    if (activeWithRoom.length === 0) {
      // Fallback: relax hook/outro floors down to absoluteMin
      const anyWithRoom = activeIndices.filter((idx) => durations[idx] > absoluteMin);
      if (anyWithRoom.length === 0) break;
      const shavePerScene = excess / anyWithRoom.length;
      for (const idx of anyWithRoom) {
        const reducible = durations[idx] - absoluteMin;
        const shave = Math.min(reducible, shavePerScene);
        durations[idx] -= shave;
        excess -= shave;
      }
      break;
    }

    const maxDur = Math.max(...activeWithRoom.map((idx) => durations[idx]));
    // Target duration is the second-longest duration or the floor
    const secondMax = activeWithRoom
      .map((idx) => durations[idx])
      .filter((d) => d < maxDur);
    const nextTarget = secondMax.length > 0 ? Math.max(...secondMax) : absoluteMin;

    const longest = activeWithRoom.filter((idx) => durations[idx] === maxDur);
    const stepShave = Math.min(excess / longest.length, maxDur - nextTarget);

    if (stepShave <= 0.001) {
      const flatShave = excess / longest.length;
      for (const idx of longest) {
        durations[idx] = Math.max(absoluteMin, durations[idx] - flatShave);
      }
      break;
    }

    for (const idx of longest) {
      durations[idx] -= stepShave;
      excess -= stepShave;
    }
  }

  return durations.map((d) => parseFloat(Math.max(0, d).toFixed(3)));
}

/**
 * Builds editor StoreScene[] from an AI edit plan and uploaded clips.
 *
 * Key guarantees:
 * 1. Supports skipping unnecessary/irrelevant clips.
 * 2. Supports multiple useful segments from the same source clip (sub-clipping).
 * 3. Never creates cuts outside valid source media boundaries (0 <= trimStart < trimEnd <= duration).
 * 4. Non-destructive duration budgeting: avoids mechanical linear compression.
 * 5. Sets both clipTrimStart and clipTrimEnd explicitly on all scenes.
 */
export function buildScenesFromPlan(
  clips: UploadedClip[],
  plan: EditPlan | null,
  targetDuration: number,
  prompt: string
): StoreScene[] {
  const requestedColor = inferRequestedColorAdjustments(prompt);
  const requestedColorGrade = inferRequestedColorGrade(prompt);
  const requestedTransition = inferRequestedTransition(prompt);
  const requestedSpeed = inferRequestedSpeed(prompt);
  const colorAdj = { ...DEFAULT_ADJ, ...(plan?.globalColorAdjustments ?? {}), ...(requestedColor ?? {}) };
  const muteSourceAudio = plan?.muteSourceAudio ?? false;

  const byIndex = new Map(clips.map((c, i) => [i, c]));

  // Determine scene sequence — allows sub-clipping (duplicate indices) and skipping (omitted indices)
  const order: number[] = plan?.sceneOrder && plan.sceneOrder.length > 0
    ? plan.sceneOrder.filter((i) => byIndex.has(i))
    : clips.map((_, i) => i);

  if (order.length === 0) {
    return [];
  }

  // Map transitions by clip index
  const transitionAfter = new Map<number, { type: string; duration: number }>();
  for (const t of plan?.transitions ?? []) {
    transitionAfter.set(t.afterClipIndex, t);
  }

  // Collect trim instructions per clip occurrence to support multiple segments from one clip
  const trimInstructionsByClip = new Map<number, Array<{ trimStart: number; trimEnd: number | null }>>();
  for (const t of plan?.trimInstructions ?? []) {
    const list = trimInstructionsByClip.get(t.clipIndex) ?? [];
    list.push(t);
    trimInstructionsByClip.set(t.clipIndex, list);
  }

  // Track per-clip usage counter so multiple scenes of the same clip get successive trim segments
  const clipUsageCount = new Map<number, number>();

  interface RawSceneDraft {
    clip: UploadedClip;
    origIdx: number;
    trimStart: number;
    naturalTrimEnd: number;
    naturalDuration: number;
  }

  const drafts: RawSceneDraft[] = [];

  for (const clipIdx of order) {
    const clip = byIndex.get(clipIdx);
    if (!clip) continue;

    const usageIndex = clipUsageCount.get(clipIdx) ?? 0;
    clipUsageCount.set(clipIdx, usageIndex + 1);

    const availableTrims = trimInstructionsByClip.get(clipIdx) ?? [];
    const trim = availableTrims[usageIndex] ?? availableTrims[0];

    const sourceDuration = Math.max(0.5, clip.duration);

    let start = typeof trim?.trimStart === "number" && !isNaN(trim.trimStart)
      ? trim.trimStart
      : 0;
    start = Math.max(0, Math.min(sourceDuration - 0.1, start));

    let end = typeof trim?.trimEnd === "number" && !isNaN(trim.trimEnd) && trim.trimEnd !== null
      ? trim.trimEnd
      : sourceDuration;
    end = Math.max(start + 0.1, Math.min(sourceDuration, end));

    const naturalDur = Math.max(0.1, end - start);

    drafts.push({
      clip,
      origIdx: clipIdx,
      trimStart: start,
      naturalTrimEnd: end,
      naturalDuration: naturalDur,
    });
  }

  // Apply editorial duration budgeting only if a positive target duration is explicitly requested
  const naturalDurations = drafts.map((d) => d.naturalDuration);
  const budgetedDurations = targetDuration > 0
    ? budgetEditorialDurations(naturalDurations, targetDuration)
    : naturalDurations;

  // Filter out any scenes pruned during budgeting (duration <= 0)
  const finalDraftsWithDurations: Array<{ draft: RawSceneDraft; budgetedDuration: number }> = [];
  for (let i = 0; i < drafts.length; i++) {
    const dur = budgetedDurations[i] ?? drafts[i].naturalDuration;
    if (dur > 0) {
      finalDraftsWithDurations.push({
        draft: drafts[i],
        budgetedDuration: dur,
      });
    }
  }

  const speed = requestedSpeed ?? 1;

  return finalDraftsWithDurations.map(({ draft, budgetedDuration }, i) => {
    const { clip, origIdx, trimStart, naturalTrimEnd } = draft;

    const finalTrimStart = parseFloat(trimStart.toFixed(3));
    // If targetDuration <= 0, preserve the complete natural dialogue without artificial truncation!
    const finalTrimEnd = targetDuration > 0
      ? parseFloat(Math.min(clip.duration, Math.max(finalTrimStart + 0.1, finalTrimStart + budgetedDuration)).toFixed(3))
      : parseFloat(naturalTrimEnd.toFixed(3));

    const rawSceneDur = Math.max(0.5, finalTrimEnd - finalTrimStart);
    const sceneDuration = parseFloat((rawSceneDur / speed).toFixed(3));

    // Determine transition: unless a transition is explicitly requested by the user, prefer zoom-in!
    let transitionType: StoreTransitionType = i < finalDraftsWithDurations.length - 1
      ? (requestedTransition ?? "zoom-in")
      : "cut";
    let transitionDuration = 0.5;

    if (i < finalDraftsWithDurations.length - 1) {
      if (requestedTransition) {
        transitionType = requestedTransition;
      } else {
        // Unless user explicitly requested another transition, keep zoom-in preferred
        transitionType = "zoom-in";
      }
    }

    return {
      id: uuidv4(),
      order: i,
      label: clip.name,
      description: clip.name,
      duration: sceneDuration,
      playbackRate: speed,
      clipId: clip.id,
      clipSrc: clip.src,
      clipType: "video" as const,
      clipTrimStart: finalTrimStart,
      clipTrimEnd: finalTrimEnd,
      captions: [],
      transition: { type: transitionType, duration: transitionDuration } as StoreTransition,
      mood: "neutral" as const,
      colorGrade: requestedColorGrade,
      colorAdjustments: { ...colorAdj },
      effects: [],
      muted: muteSourceAudio,
    } satisfies StoreScene;
  });
}
