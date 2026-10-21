import { describe, it, expect } from "vitest";
import {
  buildScenesFromPlan,
  budgetEditorialDurations,
  type UploadedClip,
  type EditPlan,
} from "@/lib/footagePlan";

function makeClip(id: string, duration: number, name = `clip_${id}.mp4`): UploadedClip {
  return {
    id,
    name,
    duration,
    src: `blob://test-${id}`,
    thumbnail: `thumb-${id}.jpg`,
  };
}

describe("Professional Lineup Engine — Editorial Duration Budgeting & Scene Building", () => {
  // ── Objective 3 & 4: Non-destructive duration budgeting ───────────────────
  describe("Duration Budgeting: Avoids mechanical linear scaling", () => {
    it("respects target duration without proportionally shrinking all scenes", () => {
      // 3 scenes with natural durations: Hook (4s), Middle (8s), Outro (4s) -> Total = 16s
      // User requests 12s target duration.
      // Under mechanical scaling (12/16 = 0.75), every scene would be 75%: [3.0, 6.0, 3.0].
      // Under editorial budgeting: the long middle scene (8s) is trimmed down from its tail,
      // while hook and outro retain their strong punch!
      const natural = [4.0, 8.0, 4.0];
      const target = 12.0;

      const budgeted = budgetEditorialDurations(natural, target);

      const total = budgeted.reduce((sum, d) => sum + d, 0);
      expect(total).toBeCloseTo(12.0, 1);

      // Hook (index 0) remains at 4.0s (uncrushed)
      expect(budgeted[0]).toBe(4.0);
      // Middle (index 1) absorbs the trim: 8.0s -> 4.0s
      expect(budgeted[1]).toBe(4.0);
      // Outro (index 2) remains at 4.0s (uncrushed)
      expect(budgeted[2]).toBe(4.0);
    });

    it("never shrinks below scene minimum floor when allocating tight budget", () => {
      const natural = [5.0, 5.0, 5.0];
      const target = 6.0;

      const budgeted = budgetEditorialDurations(natural, target, 1.5);
      const total = budgeted.reduce((sum, d) => sum + d, 0);

      expect(total).toBeCloseTo(6.0, 1);
      for (const d of budgeted) {
        expect(d).toBeGreaterThanOrEqual(1.5);
      }
    });

    it("does not artificially stretch clips when total duration is under target", () => {
      const natural = [2.5, 3.0, 2.0]; // Total 7.5s
      const target = 15.0; // User requested 15s

      const budgeted = budgetEditorialDurations(natural, target);

      // Must remain at natural duration, never invent phantom media duration
      expect(budgeted).toEqual([2.5, 3.0, 2.0]);
    });
  });

  // ── Objective 3 & 4: buildScenesFromPlan with source boundary guarantees ──
  describe("buildScenesFromPlan: Source Boundary & Editorial Integrity", () => {
    it("never creates cuts outside valid source media boundaries", () => {
      const clips: UploadedClip[] = [
        makeClip("c1", 6.0, "talking_head.mp4"),
        makeClip("c2", 4.5, "product_hero.mp4"),
      ];

      const plan: EditPlan = {
        sceneOrder: [0, 1],
        trimInstructions: [
          { clipIndex: 0, trimStart: -2.0, trimEnd: 99.0 }, // completely invalid timestamps!
          { clipIndex: 1, trimStart: 5.0, trimEnd: 2.0 },  // inverted & beyond duration!
        ],
      };

      const scenes = buildScenesFromPlan(clips, plan, -1, "Clean edit");

      expect(scenes).toHaveLength(2);

      // Scene 0: clamped to [0, 6.0]
      expect(scenes[0].clipTrimStart).toBeGreaterThanOrEqual(0);
      expect(scenes[0].clipTrimEnd).toBeLessThanOrEqual(6.0);
      expect(scenes[0].clipTrimEnd).toBeGreaterThan(scenes[0].clipTrimStart!);
      expect(scenes[0].duration).toBeCloseTo(scenes[0].clipTrimEnd! - scenes[0].clipTrimStart!, 2);

      // Scene 1: clamped within [0, 4.5]
      expect(scenes[1].clipTrimStart).toBeGreaterThanOrEqual(0);
      expect(scenes[1].clipTrimEnd).toBeLessThanOrEqual(4.5);
      expect(scenes[1].clipTrimEnd).toBeGreaterThan(scenes[1].clipTrimStart!);
    });

    it("supports sub-clipping: multiple distinct segments from the same source clip", () => {
      const clips: UploadedClip[] = [
        makeClip("long-take", 30.0, "full_interview.mp4"),
        makeClip("b-roll", 5.0, "cutaway.mp4"),
      ];

      const plan: EditPlan = {
        // Use interview first, then cutaway, then return to interview!
        sceneOrder: [0, 1, 0],
        trimInstructions: [
          { clipIndex: 0, trimStart: 2.0, trimEnd: 6.0 },   // Segment 1: greeting (4s)
          { clipIndex: 0, trimStart: 18.0, trimEnd: 23.0 }, // Segment 2: reaction (5s)
          { clipIndex: 1, trimStart: 0.0, trimEnd: 4.0 },   // Cutaway (4s)
        ],
      };

      const scenes = buildScenesFromPlan(clips, plan, -1, "Cut interview with b-roll");

      expect(scenes).toHaveLength(3);

      // Scene 0: first segment of interview
      expect(scenes[0].clipId).toBe("long-take");
      expect(scenes[0].clipTrimStart).toBe(2.0);
      expect(scenes[0].clipTrimEnd).toBe(6.0);
      expect(scenes[0].duration).toBe(4.0);

      // Scene 1: B-roll
      expect(scenes[1].clipId).toBe("b-roll");
      expect(scenes[1].clipTrimStart).toBe(0.0);
      expect(scenes[1].clipTrimEnd).toBe(4.0);

      // Scene 2: second segment of interview
      expect(scenes[2].clipId).toBe("long-take");
      expect(scenes[2].clipTrimStart).toBe(18.0);
      expect(scenes[2].clipTrimEnd).toBe(23.0);
      expect(scenes[2].duration).toBe(5.0);
    });

    it("allows unnecessary footage to be skipped", () => {
      const clips: UploadedClip[] = [
        makeClip("c0", 5.0, "intro.mp4"),
        makeClip("c1", 8.0, "blurry_take.mp4"),
        makeClip("c2", 6.0, "action.mp4"),
      ];

      // Plan only uses c0 and c2
      const plan: EditPlan = {
        sceneOrder: [0, 2],
      };

      const scenes = buildScenesFromPlan(clips, plan, -1, "Skip blurry take");

      expect(scenes).toHaveLength(2);
      expect(scenes[0].clipId).toBe("c0");
      expect(scenes[1].clipId).toBe("c2");
    });

    it("preserves important clips placed in any sequence position", () => {
      const clips: UploadedClip[] = [
        makeClip("c0", 5.0, "person_a.mp4"),
        makeClip("c1", 5.0, "person_b.mp4"),
        makeClip("c2", 5.0, "person_c.mp4"),
      ];

      // Request: start with person_c, end with person_a
      const plan: EditPlan = {
        sceneOrder: [2, 1, 0],
      };

      const scenes = buildScenesFromPlan(clips, plan, -1, "Start with person C");

      expect(scenes).toHaveLength(3);
      expect(scenes[0].clipId).toBe("c2");
      expect(scenes[1].clipId).toBe("c1");
      expect(scenes[2].clipId).toBe("c0");
      expect(scenes[0].order).toBe(0);
      expect(scenes[1].order).toBe(1);
      expect(scenes[2].order).toBe(2);
    });
  });
});
