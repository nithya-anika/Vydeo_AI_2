/**
 * Comprehensive tests for the professional pipeline validation and repair engine:
 * - Unnecessary footage can be skipped (no forced inclusion of all clips).
 * - One source clip can contribute multiple segments (sub-clipping).
 * - Important clips can appear anywhere in the sequence (order preservation).
 * - Duplicate clip references are preserved (never arbitrarily reassigned).
 * - Invalid timestamps are rejected and clamped safely.
 * - Scene durations are calculated accurately with playback speeds.
 * - Scene IDs are deduplicated safely.
 */
import { describe, it, expect } from "vitest";
import type { Scene, Timeline } from "@/types/timeline";
import type { GeminiClip, ClipAssignment } from "@/lib/gemini";
import {
  validateAndRepairTimeline,
  deduplicateSceneIds,
  preserveSceneSequence,
  validateClipAssignments,
  validateTrimBoundaries,
} from "@/lib/pipeline-guards";

function makeScene(id: string, overrides: Partial<Scene> = {}): Scene {
  return {
    id,
    order: 0,
    label: `Scene ${id}`,
    duration: 5,
    clipTrimStart: 0,
    clipTrimEnd: 5,
    transition: { type: "cut", duration: 0 },
    captions: [],
    overlays: [],
    mood: "luxury",
    motionStyle: "static",
    ...overrides,
  };
}

function makeClip(duration: number, index = 0, name = `clip_${index}.mp4`): GeminiClip {
  return {
    id: `clip-${index}`,
    name,
    duration,
    index,
    mimeType: "video/mp4",
  };
}

function makeTimeline(scenes: Scene[]): Timeline {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Test Timeline",
    brandWorkspaceId: "asaya",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalDuration: scenes.reduce((sum, s) => sum + (s.duration || 0), 0),
    aspectRatio: "9:16",
    scenes,
    audioLayers: [{ id: "audio-1", type: "bgm", startTime: 0, endTime: 20, volume: 0.6 }],
    isLocked: false,
  };
}

describe("Pipeline Validation & Repair Engine", () => {
  // ── Objective 1 & 2: Sub-clipping & no arbitrary reassignment ──────────────
  describe("Sub-clipping: Multiple segments from the same source clip", () => {
    it("preserves multiple scenes referencing the same clipIndex without reassigning", () => {
      const clips = [makeClip(12, 0), makeClip(15, 1)];
      const scenes = [
        makeScene("s1", { order: 0, clipTrimStart: 0, clipTrimEnd: 4, duration: 4 }),
        makeScene("s2", { order: 1, clipTrimStart: 1, clipTrimEnd: 5, duration: 4 }),
        makeScene("s3", { order: 2, clipTrimStart: 6, clipTrimEnd: 10, duration: 4 }), // segment 2 of clip 0!
      ];
      const assignments: ClipAssignment[] = [
        { sceneId: "s1", clipIndex: 0, trimStart: 0, trimEnd: 4 },
        { sceneId: "s2", clipIndex: 1, trimStart: 1, trimEnd: 5 },
        { sceneId: "s3", clipIndex: 0, trimStart: 6, trimEnd: 10 },
      ];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      expect(report.valid).toBe(true);
      expect(report.timeline.scenes).toHaveLength(3);
      // Verify clip 0 is used for both s1 and s3 without reassignment
      expect(report.clipAssignments.find((a) => a.sceneId === "s1")!.clipIndex).toBe(0);
      expect(report.clipAssignments.find((a) => a.sceneId === "s2")!.clipIndex).toBe(1);
      expect(report.clipAssignments.find((a) => a.sceneId === "s3")!.clipIndex).toBe(0);
    });

    it("does NOT slice scenes down to clip count when scenes > clips", () => {
      const clips = [makeClip(20, 0)]; // Only 1 clip uploaded
      const scenes = [
        makeScene("s1", { order: 0, clipTrimStart: 0, clipTrimEnd: 3, duration: 3 }),
        makeScene("s2", { order: 1, clipTrimStart: 5, clipTrimEnd: 8, duration: 3 }),
        makeScene("s3", { order: 2, clipTrimStart: 10, clipTrimEnd: 14, duration: 4 }),
      ];
      const assignments: ClipAssignment[] = [
        { sceneId: "s1", clipIndex: 0, trimStart: 0, trimEnd: 3 },
        { sceneId: "s2", clipIndex: 0, trimStart: 5, trimEnd: 8 },
        { sceneId: "s3", clipIndex: 0, trimStart: 10, trimEnd: 14 },
      ];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      expect(report.valid).toBe(true);
      // All 3 scenes must be preserved! Never chopped down to 1 scene!
      expect(report.timeline.scenes).toHaveLength(3);
      expect(report.timeline.totalDuration).toBe(10);
    });
  });

  // ── Objective 1 & 2: Skipping unnecessary clips ─────────────────────────────
  describe("Editorial Selection: Unnecessary footage can be skipped", () => {
    it("allows fewer scenes than clips when irrelevant clips are skipped", () => {
      const clips = [
        makeClip(10, 0, "hook.mp4"),
        makeClip(10, 1, "blurry_take.mp4"),
        makeClip(10, 2, "main_action.mp4"),
        makeClip(10, 3, "redundant_angle.mp4"),
        makeClip(10, 4, "cta.mp4"),
      ];
      // Model selected only clips 0, 2, and 4
      const scenes = [
        makeScene("s1", { order: 0, label: "Hook", clipTrimStart: 0, clipTrimEnd: 3, duration: 3 }),
        makeScene("s2", { order: 1, label: "Main", clipTrimStart: 2, clipTrimEnd: 6, duration: 4 }),
        makeScene("s3", { order: 2, label: "CTA", clipTrimStart: 1, clipTrimEnd: 4, duration: 3 }),
      ];
      const assignments: ClipAssignment[] = [
        { sceneId: "s1", clipIndex: 0, trimStart: 0, trimEnd: 3 },
        { sceneId: "s2", clipIndex: 2, trimStart: 2, trimEnd: 6 },
        { sceneId: "s3", clipIndex: 4, trimStart: 1, trimEnd: 4 },
      ];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      expect(report.valid).toBe(true);
      // Timeline retains exactly the 3 curated scenes, clips 1 and 3 remain skipped
      expect(report.timeline.scenes).toHaveLength(3);
      expect(report.clipAssignments.map((a) => a.clipIndex)).toEqual([0, 2, 4]);
    });
  });

  // ── Objective 2: Order preservation ─────────────────────────────────────────
  describe("Ordering: Important clips can appear anywhere in sequence", () => {
    it("preserves non-monotonic clip order (e.g. clip 2 first, clip 0 last)", () => {
      const clips = [makeClip(8, 0), makeClip(8, 1), makeClip(8, 2)];
      const scenes = [
        makeScene("s-first", { order: 0, label: "Girl with glasses" }),
        makeScene("s-mid", { order: 1, label: "Product demo" }),
        makeScene("s-last", { order: 2, label: "Intro person concluding" }),
      ];
      // Clip 2 is first, Clip 1 is second, Clip 0 is last
      const assignments: ClipAssignment[] = [
        { sceneId: "s-first", clipIndex: 2 },
        { sceneId: "s-mid", clipIndex: 1 },
        { sceneId: "s-last", clipIndex: 0 },
      ];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      expect(report.valid).toBe(true);
      expect(report.timeline.scenes[0].id).toBe("s-first");
      expect(report.timeline.scenes[1].id).toBe("s-mid");
      expect(report.timeline.scenes[2].id).toBe("s-last");
      expect(report.clipAssignments.map((a) => a.clipIndex)).toEqual([2, 1, 0]);
    });
  });

  // ── Objective 2: Timestamp validation and boundary clamping ─────────────────
  describe("Timestamp Safety: Invalid timestamps are rejected, clamped safely, and logged for evaluation", () => {
    it("clamps clipTrimEnd to actual clip duration when it overshoots and logs violation", () => {
      const clips = [makeClip(7.5, 0, "interview.mp4")];
      const scenes = [
        makeScene("s1", { label: "Interview take", clipTrimStart: 0, clipTrimEnd: 99, duration: 99 }),
      ];
      const assignments: ClipAssignment[] = [{ sceneId: "s1", clipIndex: 0, trimStart: 0, trimEnd: 99 }];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      expect(report.timeline.scenes[0].clipTrimEnd).toBe(7.5);
      expect(report.timeline.scenes[0].duration).toBe(7.5);
      expect(report.repaired).toBe(true);

      // Verify that the violation was captured for evaluation rather than silently buried
      expect(report.timestampViolations).toHaveLength(1);
      expect(report.timestampViolations[0].violationType).toBe("overshoot_end");
      expect(report.timestampViolations[0].modelTrimEnd).toBe(99);
      expect(report.timestampViolations[0].sourceDuration).toBe(7.5);
      expect(report.timestampViolations[0].clampedTrimEnd).toBe(7.5);
      expect(report.timestampViolations[0].details).toContain("exceeds clip duration (7.5s)");
    });

    it("clamps negative clipTrimStart to 0 and logs violation", () => {
      const clips = [makeClip(10, 0)];
      const scenes = [
        makeScene("s1", { clipTrimStart: -3.5, clipTrimEnd: 5, duration: 8.5 }),
      ];
      const assignments: ClipAssignment[] = [{ sceneId: "s1", clipIndex: 0, trimStart: -3.5, trimEnd: 5 }];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      expect(report.timeline.scenes[0].clipTrimStart).toBe(0);
      expect(report.timeline.scenes[0].clipTrimEnd).toBe(5);
      expect(report.timeline.scenes[0].duration).toBe(5);

      expect(report.timestampViolations).toHaveLength(1);
      expect(report.timestampViolations[0].violationType).toBe("negative_start");
      expect(report.timestampViolations[0].modelTrimStart).toBe(-3.5);
      expect(report.timestampViolations[0].clampedTrimStart).toBe(0);
    });

    it("repairs inverted trim (trimStart >= trimEnd) and logs violation", () => {
      const clips = [makeClip(10, 0)];
      const scenes = [
        makeScene("s1", { clipTrimStart: 8, clipTrimEnd: 4 }),
      ];
      const assignments: ClipAssignment[] = [{ sceneId: "s1", clipIndex: 0, trimStart: 8, trimEnd: 4 }];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      expect(report.timeline.scenes[0].clipTrimStart).toBeLessThan(report.timeline.scenes[0].clipTrimEnd!);
      expect(report.timeline.scenes[0].clipTrimEnd).toBe(10);

      expect(report.timestampViolations).toHaveLength(1);
      expect(report.timestampViolations[0].violationType).toBe("inverted_bounds");
      expect(report.timestampViolations[0].details).toContain("inverted/zero trim range");
    });

    it("calculates duration with playback speed correctly", () => {
      const clips = [makeClip(12, 0)];
      const scenes = [
        makeScene("s1", { clipTrimStart: 2, clipTrimEnd: 8, playbackSpeed: 2.0 }),
      ];
      const assignments: ClipAssignment[] = [{ sceneId: "s1", clipIndex: 0, trimStart: 2, trimEnd: 8 }];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      // (8 - 2) / 2.0 = 3.0 seconds
      expect(report.timeline.scenes[0].duration).toBe(3);
    });
  });

  // ── Objective 2: Deduplication and sequence preservation ────────────────────
  describe("Structural Repairs: Deduplicate scene IDs", () => {
    it("deduplicates identical scene UUIDs without dropping scenes or misaligning assignments", () => {
      const clips = [makeClip(10, 0), makeClip(10, 1)];
      const duplicateId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
      const scenes = [
        makeScene(duplicateId, { label: "Scene A" }),
        makeScene(duplicateId, { label: "Scene B" }), // duplicate!
      ];
      const assignments: ClipAssignment[] = [
        { sceneId: duplicateId, clipIndex: 0 },
        { sceneId: duplicateId, clipIndex: 1 },
      ];

      const report = validateAndRepairTimeline(makeTimeline(scenes), clips, assignments);

      expect(report.timeline.scenes).toHaveLength(2);
      expect(report.timeline.scenes[0].id).not.toBe(report.timeline.scenes[1].id);
      expect(report.repaired).toBe(true);
      // Each scene keeps its respective assignment
      expect(report.clipAssignments[0].sceneId).toBe(report.timeline.scenes[0].id);
      expect(report.clipAssignments[1].sceneId).toBe(report.timeline.scenes[1].id);
    });
  });
});
