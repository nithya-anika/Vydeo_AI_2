/**
 * Adaptive scene-aware keyframe extraction utilities.
 * Combines FFmpeg visual scene-change detection with temporal coverage
 * to provide optimal multimodal video understanding without frame bloat.
 */
import { spawn } from "child_process";

export interface KeyframeTimestampPlan {
  clipDuration: number;
  timestamps: number[];
  samplingStrategy: "visual_scene_changes" | "hybrid_coverage" | "short_clip" | "medium_clip" | "long_clip";
  sceneChangesDetected?: number;
}

/**
 * Calculates adaptive, scene-aware keyframe timestamps across a video clip.
 * - Under 3s: 3 keyframes (head, mid, tail).
 * - 3s to 12s: 4-6 keyframes distributed across narrative beats (~1.5s - 2.0s apart).
 * - Over 12s: 6-8 keyframes distributed at key structural positions (intro, development, climax, conclusion).
 */
export function calculateSceneKeyframeTimestamps(
  duration: number,
  maxFrames = 8
): KeyframeTimestampPlan {
  const dur = Math.max(0.5, duration);

  if (dur <= 3.0) {
    const timestamps = [
      parseFloat((dur * 0.1).toFixed(2)),
      parseFloat((dur * 0.5).toFixed(2)),
      parseFloat((dur * 0.9).toFixed(2)),
    ];
    return {
      clipDuration: dur,
      timestamps: Array.from(new Set(timestamps)).sort((a, b) => a - b),
      samplingStrategy: "short_clip",
    };
  }

  if (dur <= 12.0) {
    // 4 to 6 frames spaced ~1.5s - 2.0s apart
    const count = Math.min(maxFrames, Math.max(4, Math.floor(dur / 1.8)));
    const timestamps: number[] = [];
    const step = dur / (count + 1);

    timestamps.push(parseFloat(Math.max(0.2, step * 0.8).toFixed(2)));
    for (let i = 2; i <= count; i++) {
      timestamps.push(parseFloat((step * i).toFixed(2)));
    }
    timestamps.push(parseFloat(Math.min(dur - 0.2, dur * 0.95).toFixed(2)));

    return {
      clipDuration: dur,
      timestamps: Array.from(new Set(timestamps)).sort((a, b) => a - b),
      samplingStrategy: "medium_clip",
    };
  }

  // Long clips (> 12s): distribute 6-8 keyframes to cover arc
  const targetCount = Math.min(maxFrames, 8);
  const timestamps: number[] = [];
  const fractions = [0.05, 0.18, 0.35, 0.50, 0.65, 0.80, 0.92, 0.98].slice(0, targetCount);

  for (const frac of fractions) {
    timestamps.push(parseFloat((dur * frac).toFixed(2)));
  }

  return {
    clipDuration: dur,
    timestamps: Array.from(new Set(timestamps)).sort((a, b) => a - b),
    samplingStrategy: "long_clip",
  };
}

/**
 * Combines real visual scene-change candidates with temporal coverage anchors.
 * Preserves exact source timestamps and keeps total frame count strictly bounded.
 */
export function selectHybridKeyframeTimestamps(params: {
  duration: number;
  sceneChangeTimestamps?: number[];
  maxFrames?: number;
}): KeyframeTimestampPlan {
  const { duration, sceneChangeTimestamps = [], maxFrames = 8 } = params;
  const dur = Math.max(0.5, duration);

  if (!sceneChangeTimestamps.length) {
    return calculateSceneKeyframeTimestamps(dur, maxFrames);
  }

  // Filter valid scene changes within bounds
  const validChanges = sceneChangeTimestamps
    .filter((ts) => Number.isFinite(ts) && ts >= 0.1 && ts <= dur - 0.1)
    .sort((a, b) => a - b);

  if (validChanges.length === 0) {
    return calculateSceneKeyframeTimestamps(dur, maxFrames);
  }

  // Guarantee anchor timestamps: head (0.2s or 5%) and tail (dur - 0.2s or 95%)
  const headAnchor = parseFloat(Math.min(0.3, dur * 0.05).toFixed(2));
  const tailAnchor = parseFloat(Math.max(dur - 0.3, dur * 0.95).toFixed(2));

  const candidatePool = [headAnchor, ...validChanges, tailAnchor];

  // Deduplicate timestamps closer than 0.8s
  const selected: number[] = [];
  for (const ts of candidatePool) {
    const rounded = parseFloat(ts.toFixed(2));
    if (!selected.some((s) => Math.abs(s - rounded) < 0.8)) {
      selected.push(rounded);
    }
  }

  // If frame count exceeds maxFrames, pick evenly distributed subset
  if (selected.length > maxFrames) {
    const result: number[] = [selected[0]];
    const step = (selected.length - 1) / (maxFrames - 1);
    for (let i = 1; i < maxFrames - 1; i++) {
      result.push(selected[Math.round(i * step)]);
    }
    result.push(selected[selected.length - 1]);
    return {
      clipDuration: dur,
      timestamps: Array.from(new Set(result)).sort((a, b) => a - b),
      samplingStrategy: "hybrid_coverage",
      sceneChangesDetected: validChanges.length,
    };
  }

  return {
    clipDuration: dur,
    timestamps: selected.sort((a, b) => a - b),
    samplingStrategy: "visual_scene_changes",
    sceneChangesDetected: validChanges.length,
  };
}

/**
 * Runs FFmpeg visual scene change detection on a local media file.
 * Returns array of second timestamps where visual scene changes occurred.
 */
export async function detectVisualSceneChanges(
  filePath: string,
  duration: number,
  threshold = 0.30
): Promise<number[]> {
  return new Promise((resolve) => {
    if (!filePath || duration <= 0) {
      return resolve([]);
    }

    const args = [
      "-i", filePath,
      "-filter_complex", `select='gt(scene,${threshold})',metadata=print:file=-`,
      "-f", "null",
      "-",
    ];

    const proc = spawn("ffmpeg", args);
    let output = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => {
      const timestamps: number[] = [];
      const regex = /pts_time:([0-9.]+)/g;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(output)) !== null) {
        const val = parseFloat(match[1]);
        if (Number.isFinite(val) && val >= 0 && val <= duration) {
          timestamps.push(parseFloat(val.toFixed(2)));
        }
      }

      resolve(Array.from(new Set(timestamps)).sort((a, b) => a - b));
    });

    proc.on("error", () => {
      resolve([]);
    });
  });
}
