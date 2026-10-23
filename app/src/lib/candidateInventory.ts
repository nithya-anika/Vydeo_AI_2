/**
 * Candidate-Based Editorial Planning Inventory
 *
 * Pre-constructs structured, verified candidate media segments from:
 * 1. Detected scene boundaries and visual keyframes (videoKeyframes / video-analysis).
 * 2. Spoken sentence and phrase timestamps (transcription / speechSegments).
 * 3. Media file duration and acoustic boundaries.
 *
 * Gives each segment a stable candidate ID, source clip ID, and exact in/out timestamps.
 * The AI editor selects and orders candidate IDs rather than inventing unconstrained floating-point timestamps.
 */

import { v4 as uuidv4 } from "uuid";
import type { GeminiClip, ClipAssignment, SpeechSegment } from "@/lib/gemini";
import type { VideoAnalysisOutput, ClipAnalysis, SceneDetection } from "@/lib/tools/video-analysis";
import type { Scene, Timeline } from "@/types/timeline";
import type { BrandWorkspace } from "@/types/brand";

export interface CandidateSegment {
  candidateId: string;          // e.g. "cand_c0_s0"
  clipId: string;               // Source clip ID
  clipIndex: number;            // 0-based clip index
  clipName: string;
  sourceTrimStart: number;      // Exact in-point in source media (seconds)
  sourceTrimEnd: number;        // Exact out-point in source media (seconds)
  duration: number;             // sourceTrimEnd - sourceTrimStart
  visualDescription: string;    // What is seen in this segment
  action?: string;              // Specific action observed
  cameraMovement?: string;      // static, pan, tilt, tracking, etc.
  visualQuality?: "low" | "medium" | "high" | "cinematic";
  confidence: number;           // 0.0 to 1.0
  hasHuman: boolean;
  hasProduct: boolean;
  speechText?: string;          // Dialogue spoken during this segment
  isSpeechStart?: boolean;
  isSpeechEnd?: boolean;
  isSilence?: boolean;
  suitableAsHook?: boolean;
  hookRationale?: string;
}

export interface CandidateInventory {
  candidates: CandidateSegment[];
  candidatesByClip: Map<number, CandidateSegment[]>;
  candidateLookup: Map<string, CandidateSegment>;
  totalAvailableDuration: number;
}

/**
 * Builds a deterministic candidate segment inventory from uploaded clips and video analysis.
 */
export function buildCandidateSegmentInventory(
  clips: GeminiClip[],
  videoAnalysis?: VideoAnalysisOutput
): CandidateInventory {
  const candidates: CandidateSegment[] = [];
  const candidatesByClip = new Map<number, CandidateSegment[]>();
  const candidateLookup = new Map<string, CandidateSegment>();

  clips.forEach((clip, clipIndex) => {
    const clipId = clip.id ?? `clip-${clipIndex}`;
    const clipDuration = Math.max(0.5, clip.duration ?? 5.0);
    const clipAnalysis = videoAnalysis?.clips?.find((c) => c.clipIndex === clipIndex);
    const speechSegments = clip.speechSegments ?? [];
    const clipCandidates: CandidateSegment[] = [];

    // Case 1: Video Analysis detected sub-scenes
    if (clipAnalysis?.scenes && clipAnalysis.scenes.length > 0) {
      clipAnalysis.scenes.forEach((sceneDet, sIdx) => {
        const start = Math.max(0, Math.min(clipDuration - 0.1, sceneDet.startTime));
        const end = Math.max(start + 0.1, Math.min(clipDuration, sceneDet.endTime));
        const segDur = parseFloat((end - start).toFixed(3));

        // Find intersecting dialogue
        const dialogue = speechSegments
          .filter((s) => s.startTime < end && s.endTime > start)
          .map((s) => s.text)
          .join(" ");

        const isConfirmedSilence = clip.transcriptionStatus === "completed_no_speech";
        const isFailed = clip.transcriptionStatus === "failed";

        const candidate: CandidateSegment = {
          candidateId: `cand_c${clipIndex}_s${sIdx}`,
          clipId,
          clipIndex,
          clipName: clip.name,
          sourceTrimStart: parseFloat(start.toFixed(3)),
          sourceTrimEnd: parseFloat(end.toFixed(3)),
          duration: segDur,
          visualDescription: sceneDet.description || clip.name,
          action: isFailed ? `${sceneDet.action || "visual scene"} (speech status unverified)` : (sceneDet.action || "visual scene"),
          cameraMovement: sceneDet.cameraMovement || clipAnalysis.cameraMovement || "static",
          visualQuality: sceneDet.visualQuality || clipAnalysis.quality || "high",
          confidence: sceneDet.confidence ?? 0.9,
          hasHuman: sceneDet.hasHuman ?? false,
          hasProduct: sceneDet.hasProduct ?? false,
          speechText: dialogue || undefined,
          isSilence: isConfirmedSilence || (!dialogue && !isFailed),
          suitableAsHook: sceneDet.suitableAsHook ?? (start === 0 && (sceneDet.hasProduct || sceneDet.hasHuman)),
          hookRationale: sceneDet.hookRationale,
        };

        clipCandidates.push(candidate);
      });
    }

    // Case 2: Speech segments provided with no visual sub-scenes
    else if (speechSegments.length > 0) {
      speechSegments.forEach((speech, spIdx) => {
        const start = Math.max(0, Math.min(clipDuration - 0.1, speech.startTime));
        const end = Math.max(start + 0.2, Math.min(clipDuration, speech.endTime));
        const candidate: CandidateSegment = {
          candidateId: `cand_c${clipIndex}_sp${spIdx}`,
          clipId,
          clipIndex,
          clipName: clip.name,
          sourceTrimStart: parseFloat(start.toFixed(3)),
          sourceTrimEnd: parseFloat(end.toFixed(3)),
          duration: parseFloat((end - start).toFixed(3)),
          visualDescription: `Spoken dialogue: "${speech.text}"`,
          action: "speaking",
          cameraMovement: "static",
          visualQuality: "high",
          confidence: 0.95,
          hasHuman: true,
          hasProduct: false,
          speechText: speech.text,
          isSpeechStart: true,
          isSpeechEnd: true,
          isSilence: false,
          suitableAsHook: spIdx === 0,
        };
        clipCandidates.push(candidate);
      });
    }

    // Case 3: Single whole clip candidate (or fallback)
    if (clipCandidates.length === 0) {
      const isFailed = clip.transcriptionStatus === "failed";
      const isConfirmedSilence = clip.transcriptionStatus === "completed_no_speech";

      const candidate: CandidateSegment = {
        candidateId: `cand_c${clipIndex}_full`,
        clipId,
        clipIndex,
        clipName: clip.name,
        sourceTrimStart: 0.0,
        sourceTrimEnd: parseFloat(clipDuration.toFixed(3)),
        duration: parseFloat(clipDuration.toFixed(3)),
        visualDescription: clip.name,
        action: isFailed ? "full take (speech status unverified)" : "full clip take",
        cameraMovement: "static",
        visualQuality: "high",
        confidence: 0.8,
        hasHuman: false,
        hasProduct: false,
        isSilence: isConfirmedSilence ? true : (isFailed ? false : true),
        suitableAsHook: clipIndex === 0,
      };
      clipCandidates.push(candidate);
    }

    candidates.push(...clipCandidates);
    candidatesByClip.set(clipIndex, clipCandidates);
    clipCandidates.forEach((c) => candidateLookup.set(c.candidateId, c));
  });

  const totalAvailableDuration = parseFloat(
    candidates.reduce((sum, c) => sum + c.duration, 0).toFixed(3)
  );

  return {
    candidates,
    candidatesByClip,
    candidateLookup,
    totalAvailableDuration,
  };
}

export interface SelectedCandidateOrder {
  candidateId: string;
  role?: "hook" | "problem" | "feature" | "solution" | "cta" | "b-roll" | "reaction";
  label?: string;
  captionText?: string;
  transitionType?: string;
  playbackSpeed?: number;
  customTrimStart?: number;
  customTrimEnd?: number;
}

/**
 * Deterministically resolves selected candidate IDs back to strictly bounded scenes.
 * Guarantees zero invented out-of-bounds timestamps and respects speech boundaries.
 */
export function resolveSelectedCandidatesToScenes(params: {
  selections: SelectedCandidateOrder[];
  inventory: CandidateInventory;
  clips: GeminiClip[];
  brand: BrandWorkspace;
  aspectRatio?: string;
  targetDuration?: number;
}): {
  scenes: Scene[];
  clipAssignments: ClipAssignment[];
  resolvedCandidateCount: number;
  omittedCandidateCount: number;
  totalDuration: number;
} {
  const { selections, inventory, clips, brand, targetDuration } = params;
  const scenes: Scene[] = [];
  const clipAssignments: ClipAssignment[] = [];
  const usedCandidateIds = new Set<string>();

  selections.forEach((sel, orderIndex) => {
    if (!sel || !sel.candidateId) {
      throw new Error(`Missing candidateId at scene order ${orderIndex + 1}.`);
    }

    let candidate = inventory.candidateLookup.get(sel.candidateId);

    // Fallback: if candidateId was slightly malformed, try matching by clipIndex
    if (!candidate) {
      const match = sel.candidateId?.match(/cand_c(\d+)/);
      if (match) {
        const cIdx = parseInt(match[1], 10);
        const available = inventory.candidatesByClip.get(cIdx);
        if (available && available.length > 0) {
          candidate = available[0];
        }
      }
    }

    if (!candidate) {
      throw new Error(`Invalid or unknown candidate ID requested: "${sel.candidateId}". Pipeline cannot securely infer boundaries.`);
    }

    usedCandidateIds.add(candidate.candidateId);
    const sourceClip = clips[candidate.clipIndex];
    const sourceDuration = sourceClip?.duration ?? candidate.sourceTrimEnd;

    // Deterministic bounds from verified inventory
    let start = candidate.sourceTrimStart;
    let end = candidate.sourceTrimEnd;

    // Optional fine-trimming within candidate boundaries only
    if (typeof sel.customTrimStart === "number" && !isNaN(sel.customTrimStart)) {
      start = Math.max(candidate.sourceTrimStart, Math.min(candidate.sourceTrimEnd - 0.2, sel.customTrimStart));
    }
    if (typeof sel.customTrimEnd === "number" && !isNaN(sel.customTrimEnd)) {
      end = Math.max(start + 0.2, Math.min(candidate.sourceTrimEnd, sel.customTrimEnd));
    }

    const speed = sel.playbackSpeed && sel.playbackSpeed > 0 && sel.playbackSpeed <= 16 ? sel.playbackSpeed : 1.0;
    const sceneDur = parseFloat(((end - start) / speed).toFixed(3));
    const sceneId = uuidv4();

    const captions = sel.captionText
      ? [{
          id: uuidv4(),
          text: sel.captionText,
          startTime: 0.3,
          endTime: Math.max(0.8, sceneDur - 0.2),
          style: "brand-default" as const,
        }]
      : candidate.speechText
      ? [{
          id: uuidv4(),
          text: candidate.speechText,
          startTime: 0.2,
          endTime: Math.max(0.6, sceneDur - 0.1),
          style: "brand-default" as const,
        }]
      : [];

    scenes.push({
      id: sceneId,
      order: orderIndex,
      label: sel.label || candidate.visualDescription.slice(0, 40) || candidate.clipName,
      description: candidate.visualDescription,
      duration: Math.max(0.5, sceneDur),
      clipTrimStart: start,
      clipTrimEnd: end,
      clipSrc: sourceClip?.src,
      clipType: sourceClip?.mimeType?.startsWith("image") ? "image" : "video",
      playbackSpeed: speed,
      transition: {
        type: (sel.transitionType || "cut") as any,
        duration: 0.3,
      },
      captions,
      overlays: [],
      motionStyle: (candidate.cameraMovement as any) || "static",
      mood: "calm",
    });

    clipAssignments.push({
      sceneId,
      clipIndex: candidate.clipIndex,
      clipId: candidate.clipId,
      trimStart: start,
      trimEnd: end,
    });
  });

  const totalDuration = parseFloat(
    scenes.reduce((sum, s) => sum + s.duration, 0).toFixed(3)
  );

  return {
    scenes,
    clipAssignments,
    resolvedCandidateCount: scenes.length,
    omittedCandidateCount: Math.max(0, inventory.candidates.length - usedCandidateIds.size),
    totalDuration,
  };
}
