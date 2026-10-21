import { v4 as uuidv4 } from "uuid";
import type { Scene, Timeline } from "@/types/timeline";
import type { GeminiClip, ClipAssignment } from "@/lib/gemini";
import { snapTrimToSpeechBoundaries } from "./transcription";

export interface TimelineValidationOptions {
  minSceneDuration?: number;
  maxSceneDuration?: number;
  defaultSpeed?: number;
}

export interface TimestampViolation {
  sceneId: string;
  sceneLabel?: string;
  clipIndex: number;
  clipName?: string;
  sourceDuration?: number;
  modelTrimStart?: number;
  modelTrimEnd?: number;
  clampedTrimStart: number;
  clampedTrimEnd: number;
  violationType: "negative_start" | "overshoot_start" | "overshoot_end" | "inverted_bounds" | "invalid_number";
  details: string;
}

export interface TimelineValidationReport {
  valid: boolean;
  timeline: Timeline;
  clipAssignments: ClipAssignment[];
  repaired: boolean;
  repairNotes: string[];
  timestampViolations: TimestampViolation[];
  errors: string[];
}

/**
 * Deduplicate scene IDs.
 * If two scenes share the same UUID, the subsequent one receives a new UUID
 * and its corresponding clipAssignment entry is updated to match.
 */
export function deduplicateSceneIds(
  scenes: Scene[],
  clipAssignments: ClipAssignment[]
): { scenes: Scene[]; clipAssignments: ClipAssignment[]; repaired: boolean; notes: string[] } {
  const seenIds = new Set<string>();
  const notes: string[] = [];
  let repaired = false;

  const updatedAssignments = clipAssignments.map((a) => ({ ...a }));

  const updatedScenes = scenes.map((scene, sceneIndex) => {
    if (!scene.id || seenIds.has(scene.id)) {
      const oldId = scene.id || "unassigned";
      const newId = uuidv4();
      repaired = true;
      notes.push(`Deduplicated scene ID: replaced "${oldId}" with "${newId}"`);

      // Update the assignment corresponding to this specific scene instance
      const assignment =
        updatedAssignments[sceneIndex] && updatedAssignments[sceneIndex].sceneId === oldId
          ? updatedAssignments[sceneIndex]
          : updatedAssignments.find((a, i) => i >= sceneIndex && a.sceneId === oldId)
            ?? updatedAssignments.find((a) => a.sceneId === oldId);

      if (assignment) {
        assignment.sceneId = newId;
      }

      seenIds.add(newId);
      return { ...scene, id: newId };
    }

    seenIds.add(scene.id);
    return scene;
  });

  return { scenes: updatedScenes, clipAssignments: updatedAssignments, repaired, notes };
}

/**
 * Normalizes scene orders strictly 0, 1, 2, ..., N-1 while preserving
 * the intended editorial sequence.
 */
export function preserveSceneSequence(scenes: Scene[]): Scene[] {
  return scenes.map((scene, index) => ({
    ...scene,
    order: index,
  }));
}

/**
 * Validates clip references and assignments:
 * - Allows multiple scenes to reference the same clipIndex (sub-clipping).
 * - Never arbitrarily reassigns a clip just because another scene uses it.
 * - Safely maps scenes to valid clip indices and attaches source metadata.
 */
export function validateClipAssignments(
  scenes: Scene[],
  clips: GeminiClip[],
  clipAssignments: ClipAssignment[]
): {
  scenes: Scene[];
  clipAssignments: ClipAssignment[];
  repaired: boolean;
  notes: string[];
  errors: string[];
} {
  const notes: string[] = [];
  const errors: string[] = [];
  let repaired = false;

  if (clips.length === 0) {
    // Concept mode (no uploaded footage)
    return { scenes, clipAssignments, repaired: false, notes, errors };
  }

  const updatedAssignments: ClipAssignment[] = [...clipAssignments];

  const updatedScenes = scenes.map((scene, sceneIndex) => {
    let assignment = updatedAssignments.find((a) => a.sceneId === scene.id);

    // If no assignment exists for this scene, attempt intelligent association
    if (!assignment) {
      // 1. Try matching by clipSrc
      let matchedIndex = clips.findIndex((c) => c.src && scene.clipSrc && c.src === scene.clipSrc);

      // 2. Try matching by clip name or label
      if (matchedIndex === -1 && scene.label) {
        matchedIndex = clips.findIndex(
          (c) => c.name && scene.label.toLowerCase().includes(c.name.toLowerCase())
        );
      }

      // 3. Fallback: if only 1 clip exists, use it; otherwise use sceneIndex if within bounds
      if (matchedIndex === -1) {
        if (clips.length === 1) {
          matchedIndex = 0;
        } else if (sceneIndex < clips.length) {
          matchedIndex = sceneIndex;
        } else {
          matchedIndex = 0; // Default to first clip rather than dropping
        }
      }

      assignment = {
        sceneId: scene.id,
        clipIndex: matchedIndex,
        clipId: clips[matchedIndex]?.id,
        trimStart: scene.clipTrimStart ?? 0,
        trimEnd: scene.clipTrimEnd ?? clips[matchedIndex]?.duration,
      };
      updatedAssignments.push(assignment);
      repaired = true;
      notes.push(`Created missing clip assignment for scene "${scene.label || scene.id}" -> Clip ${matchedIndex}`);
    }

    // Validate that the assigned clipIndex is within range
    if (assignment.clipIndex < 0 || assignment.clipIndex >= clips.length || isNaN(assignment.clipIndex)) {
      repaired = true;
      notes.push(
        `Repaired out-of-bounds clipIndex ${assignment.clipIndex} on scene "${scene.label || scene.id}" -> clamp to 0`
      );
      assignment.clipIndex = 0;
    }

    const sourceClip = clips[assignment.clipIndex];
    if (sourceClip) {
      assignment.clipId = sourceClip.id ?? assignment.clipId;
      return {
        ...scene,
        clipSrc: scene.clipSrc || sourceClip.src || undefined,
        clipType: scene.clipType || (sourceClip.mimeType?.startsWith("image") ? "image" : "video"),
      };
    }

    return scene;
  });

  return {
    scenes: updatedScenes,
    clipAssignments: updatedAssignments,
    repaired,
    notes,
    errors,
  };
}

/**
 * Validates and clamps trim boundaries for all scenes.
 * Guarantees:
 * 1. 0 <= clipTrimStart < clipTrimEnd <= sourceClip.duration
 * 2. Playback speed is positive and bounded (0.1 to 16.0).
 * 3. Scene duration is strictly: (clipTrimEnd - clipTrimStart) / playbackSpeed
 */
export function validateTrimBoundaries(
  scenes: Scene[],
  clips: GeminiClip[],
  clipAssignments: ClipAssignment[],
  options: TimelineValidationOptions = {}
): {
  scenes: Scene[];
  clipAssignments: ClipAssignment[];
  repaired: boolean;
  notes: string[];
  timestampViolations: TimestampViolation[];
} {
  const notes: string[] = [];
  const timestampViolations: TimestampViolation[] = [];
  let repaired = false;
  const minDuration = options.minSceneDuration ?? 0.5;

  const updatedScenes = scenes.map((scene, sceneIndex) => {
    const assignment = clipAssignments.find((a) => a.sceneId === scene.id);
    const clipIdx = assignment?.clipIndex ?? (sceneIndex < clips.length ? sceneIndex : 0);
    const sourceClip = clips[clipIdx];
    const sourceDuration = sourceClip?.duration;

    // Validate speed
    let speed = scene.playbackSpeed ?? 1.0;
    if (typeof speed !== "number" || isNaN(speed) || speed <= 0 || speed > 16) {
      speed = options.defaultSpeed ?? 1.0;
      repaired = true;
      notes.push(`Reset invalid playbackSpeed to ${speed} on scene ${scene.id}`);
    }

    if (!sourceDuration || sourceDuration <= 0) {
      // Image or duration unknown: ensure positive duration
      const dur = Math.max(minDuration, typeof scene.duration === "number" && !isNaN(scene.duration) ? scene.duration : 3);
      return {
        ...scene,
        playbackSpeed: speed,
        duration: dur,
      };
    }

    const rawStart = typeof scene.clipTrimStart === "number" && !isNaN(scene.clipTrimStart)
      ? scene.clipTrimStart
      : (assignment?.trimStart ?? 0);
    const rawEnd = typeof scene.clipTrimEnd === "number" && !isNaN(scene.clipTrimEnd)
      ? scene.clipTrimEnd
      : (assignment?.trimEnd ?? sourceDuration);

    let start = rawStart;
    let end = rawEnd;

    // Negative start correction
    if (start < 0) {
      start = 0;
      repaired = true;
      const violation: TimestampViolation = {
        sceneId: scene.id,
        sceneLabel: scene.label,
        clipIndex: clipIdx,
        clipName: sourceClip?.name,
        sourceDuration,
        modelTrimStart: rawStart,
        modelTrimEnd: rawEnd,
        clampedTrimStart: 0,
        clampedTrimEnd: Math.min(sourceDuration, end),
        violationType: "negative_start",
        details: `Model produced negative clipTrimStart (${rawStart}s). Clamped to 0.0s.`,
      };
      timestampViolations.push(violation);
      notes.push(violation.details);
      console.warn(`[pipeline-guards:timestamp-violation] Scene "${scene.label || scene.id}": ${violation.details}`);
    }

    // Start beyond source duration
    if (start >= sourceDuration) {
      start = Math.max(0, sourceDuration - minDuration);
      repaired = true;
      const violation: TimestampViolation = {
        sceneId: scene.id,
        sceneLabel: scene.label,
        clipIndex: clipIdx,
        clipName: sourceClip?.name,
        sourceDuration,
        modelTrimStart: rawStart,
        modelTrimEnd: rawEnd,
        clampedTrimStart: start,
        clampedTrimEnd: sourceDuration,
        violationType: "overshoot_start",
        details: `Model clipTrimStart (${rawStart}s) exceeds clip duration (${sourceDuration}s). Clamped to ${start}s.`,
      };
      timestampViolations.push(violation);
      notes.push(violation.details);
      console.warn(`[pipeline-guards:timestamp-violation] Scene "${scene.label || scene.id}": ${violation.details}`);
    }

    // End exceeding source duration
    if (end > sourceDuration) {
      end = sourceDuration;
      repaired = true;
      const violation: TimestampViolation = {
        sceneId: scene.id,
        sceneLabel: scene.label,
        clipIndex: clipIdx,
        clipName: sourceClip?.name,
        sourceDuration,
        modelTrimStart: rawStart,
        modelTrimEnd: rawEnd,
        clampedTrimStart: start,
        clampedTrimEnd: sourceDuration,
        violationType: "overshoot_end",
        details: `Model clipTrimEnd (${rawEnd}s) exceeds clip duration (${sourceDuration}s). Clamped to ${sourceDuration}s.`,
      };
      timestampViolations.push(violation);
      notes.push(violation.details);
      console.warn(`[pipeline-guards:timestamp-violation] Scene "${scene.label || scene.id}": ${violation.details}`);
    }

    // End less than or equal to start
    if (end <= start) {
      end = sourceDuration;
      if (end <= start) {
        start = Math.max(0, sourceDuration - minDuration);
        end = sourceDuration;
      }
      repaired = true;
      const violation: TimestampViolation = {
        sceneId: scene.id,
        sceneLabel: scene.label,
        clipIndex: clipIdx,
        clipName: sourceClip?.name,
        sourceDuration,
        modelTrimStart: rawStart,
        modelTrimEnd: rawEnd,
        clampedTrimStart: start,
        clampedTrimEnd: end,
        violationType: "inverted_bounds",
        details: `Model produced inverted/zero trim range (start=${rawStart}s, end=${rawEnd}s). Repaired to [${start}s, ${end}s].`,
      };
      timestampViolations.push(violation);
      notes.push(violation.details);
      console.warn(`[pipeline-guards:timestamp-violation] Scene "${scene.label || scene.id}": ${violation.details}`);
    }

    // Audio-aware boundary alignment: snap trims to natural sentence and speech pauses
    if (sourceClip?.speechSegments?.length && sourceDuration > 0) {
      const status = sourceClip.transcriptionStatus ?? "completed_with_speech";
      const snapped = snapTrimToSpeechBoundaries(start, end, sourceClip.speechSegments, sourceDuration, 0.35, [], status);
      if (snapped.snappedStart || snapped.snappedEnd) {
        start = snapped.trimStart;
        end = snapped.trimEnd;
        notes.push(`Audio-aware boundary alignment on scene "${scene.label || scene.id}": [${start}s - ${end}s]`);
      }
    } else if (sourceClip?.transcriptionStatus === "failed") {
      notes.push(`Speech status unverified on scene "${scene.label || scene.id}": transcription failed, applied conservative full boundary.`);
    }

    const rawSpan = Math.max(0.1, end - start);
    const computedDuration = Math.max(minDuration, parseFloat((rawSpan / speed).toFixed(3)));

    const updatedStart = parseFloat(start.toFixed(3));
    const updatedEnd = parseFloat(end.toFixed(3));

    // Update assignment in tandem
    if (assignment) {
      assignment.trimStart = updatedStart;
      assignment.trimEnd = updatedEnd;
    }

    return {
      ...scene,
      playbackSpeed: speed,
      clipTrimStart: updatedStart,
      clipTrimEnd: updatedEnd,
      duration: computedDuration,
    };
  });

  return { scenes: updatedScenes, clipAssignments, repaired, notes, timestampViolations };
}

/**
 * Comprehensive timeline validation and repair pipeline.
 *
 * Enforces editorial integrity:
 * 1. Deduplicates scene IDs without dropping scenes.
 * 2. Preserves exact scene ordering (0..N-1).
 * 3. Supports sub-clipping (multiple scenes from the same source clip).
 * 4. Supports selective curation (unnecessary footage can be omitted).
 * 5. Strictly clamps trim bounds to [0, clip.duration].
 * 6. Calculates scene durations from trims and playback speeds.
 * 7. Recalculates totalDuration matching sum of scenes.
 */
export function validateAndRepairTimeline(
  timeline: Timeline,
  clips: GeminiClip[] = [],
  clipAssignments: ClipAssignment[] = [],
  options: TimelineValidationOptions = {}
): TimelineValidationReport {
  const repairNotes: string[] = [];
  const errors: string[] = [];
  let isRepaired = false;

  if (!timeline || !Array.isArray(timeline.scenes)) {
    return {
      valid: false,
      timeline: timeline || ({} as Timeline),
      clipAssignments,
      repaired: false,
      repairNotes,
      timestampViolations: [],
      errors: ["Timeline or timeline.scenes is missing or invalid."],
    };
  }

  if (timeline.scenes.length === 0) {
    return {
      valid: false,
      timeline,
      clipAssignments,
      repaired: false,
      repairNotes,
      timestampViolations: [],
      errors: ["Timeline contains 0 scenes."],
    };
  }

  // 1. Deduplicate Scene IDs
  const dedupeResult = deduplicateSceneIds(timeline.scenes, clipAssignments);
  let scenes = dedupeResult.scenes;
  let assignments = dedupeResult.clipAssignments;
  if (dedupeResult.repaired) {
    isRepaired = true;
    repairNotes.push(...dedupeResult.notes);
  }

  // 2. Preserve Scene Sequence
  scenes = preserveSceneSequence(scenes);

  // 3. Validate Clip Assignments (preserves multi-segment references, no arbitrary reassignments)
  const assignResult = validateClipAssignments(scenes, clips, assignments);
  scenes = assignResult.scenes;
  assignments = assignResult.clipAssignments;
  if (assignResult.repaired) {
    isRepaired = true;
    repairNotes.push(...assignResult.notes);
  }
  if (assignResult.errors.length > 0) {
    errors.push(...assignResult.errors);
  }

  // 4. Validate Trim Boundaries and Recalculate Scene Durations
  const trimResult = validateTrimBoundaries(scenes, clips, assignments, options);
  scenes = trimResult.scenes;
  assignments = trimResult.clipAssignments;
  if (trimResult.repaired) {
    isRepaired = true;
    repairNotes.push(...trimResult.notes);
  }

  // 5. Total Duration Recalculation
  const totalDuration = parseFloat(
    scenes.reduce((sum, s) => sum + (s.duration || 0), 0).toFixed(3)
  );

  // 6. Audio layers alignment
  const updatedAudioLayers = (timeline.audioLayers || []).map((layer) => {
    if (layer.type === "bgm") {
      return { ...layer, startTime: 0, endTime: totalDuration };
    }
    return layer;
  });

  const repairedTimeline: Timeline = {
    ...timeline,
    scenes,
    audioLayers: updatedAudioLayers,
    totalDuration: totalDuration > 0 ? totalDuration : 1,
    updatedAt: new Date().toISOString(),
  };

  return {
    valid: errors.length === 0,
    timeline: repairedTimeline,
    clipAssignments: assignments,
    repaired: isRepaired,
    repairNotes,
    timestampViolations: trimResult.timestampViolations,
    errors,
  };
}
