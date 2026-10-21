import { describe, it, expect } from "vitest";
import { calculateSceneKeyframeTimestamps, selectHybridKeyframeTimestamps } from "@/lib/videoKeyframes";
import {
  normalizeSpeechSegments,
  detectSilenceWindows,
  snapTrimToSpeechBoundaries,
} from "@/lib/transcription";
import { validateTrimBoundaries } from "@/lib/pipeline-guards";
import type { Scene } from "@/types/timeline";
import type { GeminiClip, ClipAssignment, SpeechSegment } from "@/lib/gemini";

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
    mood: "calm",
    motionStyle: "static",
    ...overrides,
  };
}

describe("Phase 2: Rich Video Understanding & Audio-Aware Editing", () => {
  // ── Priority 2: Scene-aware & hybrid keyframe extraction ──────────────────
  describe("Scene-Aware Keyframe Sampling (videoKeyframes.ts)", () => {
    it("adaptively generates timestamps for short, medium, and long clips", () => {
      // Short clip (2.5s)
      const shortPlan = calculateSceneKeyframeTimestamps(2.5);
      expect(shortPlan.samplingStrategy).toBe("short_clip");
      expect(shortPlan.timestamps).toHaveLength(3);
      for (const ts of shortPlan.timestamps) {
        expect(ts).toBeGreaterThanOrEqual(0);
        expect(ts).toBeLessThanOrEqual(2.5);
      }

      // Medium clip (8.0s) -> 4 to 6 frames across beats
      const medPlan = calculateSceneKeyframeTimestamps(8.0);
      expect(medPlan.samplingStrategy).toBe("medium_clip");
      expect(medPlan.timestamps.length).toBeGreaterThanOrEqual(4);
      expect(medPlan.timestamps.length).toBeLessThanOrEqual(6);
      expect(medPlan.timestamps[0]).toBeGreaterThanOrEqual(0);
      expect(medPlan.timestamps[medPlan.timestamps.length - 1]).toBeLessThanOrEqual(8.0);

      // Long clip (30.0s) -> 6 to 8 frames covering the full narrative arc
      const longPlan = calculateSceneKeyframeTimestamps(30.0);
      expect(longPlan.samplingStrategy).toBe("long_clip");
      expect(longPlan.timestamps.length).toBe(8);
      expect(longPlan.timestamps[0]).toBeCloseTo(1.5, 1);
      expect(longPlan.timestamps[longPlan.timestamps.length - 1]).toBeCloseTo(29.4, 1);
    });

    it("combines visual scene changes with temporal anchors via selectHybridKeyframeTimestamps", () => {
      // Clip duration 15s with detected visual scene changes at 3.5s and 9.2s
      const hybrid = selectHybridKeyframeTimestamps({
        duration: 15.0,
        sceneChangeTimestamps: [3.5, 9.2],
        maxFrames: 6,
      });

      expect(hybrid.samplingStrategy).toBe("visual_scene_changes");
      expect(hybrid.sceneChangesDetected).toBe(2);
      expect(hybrid.timestamps).toContain(3.5);
      expect(hybrid.timestamps).toContain(9.2);
      // Anchor near head and tail
      expect(hybrid.timestamps[0]).toBeLessThanOrEqual(0.75);
      expect(hybrid.timestamps[hybrid.timestamps.length - 1]).toBeGreaterThanOrEqual(14.0);
    });

    it("never produces timestamps outside valid media bounds", () => {
      const plan = calculateSceneKeyframeTimestamps(5.5);
      for (const ts of plan.timestamps) {
        expect(ts).toBeGreaterThanOrEqual(0);
        expect(ts).toBeLessThanOrEqual(5.5);
      }
    });
  });

  // ── Priority 3: Audio evidence & transcription parsing ────────────────────
  describe("Audio Evidence & Silence Detection (transcription.ts)", () => {
    it("normalizes and sorts raw speech segment timestamps", () => {
      const raw = [
        { text: "Second phrase", startTime: 3.2, endTime: 5.0 },
        { text: "First phrase", startTime: 0.5, endTime: 2.8 },
        { text: "", startTime: 6.0, endTime: 7.0 }, // empty text should be omitted
        { text: "Out of bounds", startTime: 15.0, endTime: 20.0 }, // clamped to duration (10s)
      ];

      const normalized = normalizeSpeechSegments(raw, 10.0);

      expect(normalized).toHaveLength(3);
      expect(normalized[0].text).toBe("First phrase");
      expect(normalized[0].startTime).toBe(0.5);
      expect(normalized[0].endTime).toBe(2.8);

      expect(normalized[1].text).toBe("Second phrase");
      expect(normalized[1].startTime).toBe(3.2);

      // Clamped out of bounds
      expect(normalized[2].endTime).toBe(10.0);
    });

    it("detects silence windows between spoken phrases and clip edges", () => {
      const segments: SpeechSegment[] = [
        { text: "Hello everyone", startTime: 1.0, endTime: 3.0 },
        { text: "Welcome back", startTime: 4.5, endTime: 6.5 },
      ];
      const clipDuration = 8.0;

      const silences = detectSilenceWindows(segments, clipDuration);

      // Expected silence windows (explicitly tagged as transcript_derived):
      expect(silences).toHaveLength(3);
      expect(silences[0]).toEqual({ startTime: 0, endTime: 1.0, duration: 1.0, source: "transcript_derived" });
      expect(silences[1]).toEqual({ startTime: 3.0, endTime: 4.5, duration: 1.5, source: "transcript_derived" });
      expect(silences[2]).toEqual({ startTime: 6.5, endTime: 8.0, duration: 1.5, source: "transcript_derived" });
    });

    it("handles completely silent clips safely without errors", () => {
      const silences = detectSilenceWindows([], 12.0);
      expect(silences).toHaveLength(1);
      expect(silences[0]).toEqual({ startTime: 0, endTime: 12.0, duration: 12.0, source: "transcript_derived" });
    });
  });

  // ── Priority 3: Speech boundary snapping & waveform distinction ──────────
  describe("Audio-Aware Boundary Snapping (transcription.ts)", () => {
    const segments: SpeechSegment[] = [
      { text: "Intro hook statement", startTime: 1.2, endTime: 4.0 },
      { text: "Call to action", startTime: 5.5, endTime: 8.2 },
    ];
    const clipDuration = 10.0;

    it("snaps trimStart to speech start when cut begins near phrase opening", () => {
      // Cut requested at 1.3s (0.1s after speech starts) -> snap back to 1.2s to prevent clipping first word!
      const result = snapTrimToSpeechBoundaries(1.3, 4.0, segments, clipDuration);

      expect(result.snappedStart).toBe(true);
      expect(result.trimStart).toBe(1.2);
      expect(result.trimEnd).toBe(4.0);
      expect(result.confidence).toBe("transcript_approximate");
    });

    it("snaps trimEnd to speech end when cut finishes near phrase conclusion", () => {
      // Cut requested at 3.9s (0.1s before speech finishes) -> extend to 4.0s to avoid cutting off final syllable!
      const result = snapTrimToSpeechBoundaries(1.2, 3.9, segments, clipDuration);

      expect(result.snappedEnd).toBe(true);
      expect(result.trimEnd).toBe(4.0);
    });

    it("prioritizes verified acoustic waveform silence windows over transcript approximations", () => {
      const waveformSilences = [
        { startTime: 3.8, endTime: 5.2, duration: 1.4, source: "waveform_detected" as const },
      ];

      // Cut requested at 3.9s: inside verified acoustic waveform silence!
      const result = snapTrimToSpeechBoundaries(1.2, 3.9, segments, clipDuration, 0.35, waveformSilences);

      expect(result.confidence).toBe("waveform_verified");
      expect(result.snappedEnd).toBe(true);
    });

    it("leaves cuts alone when positioned safely in a silence window", () => {
      // Cut at 4.8s (silence is 4.0s to 5.5s) -> clean natural cut, no snap needed
      const result = snapTrimToSpeechBoundaries(1.2, 4.8, segments, clipDuration);

      expect(result.snappedEnd).toBe(false);
      expect(result.trimEnd).toBe(4.8);
    });
  });

  // ── Priority 3: Integration with pipeline guards ──────────────────────────
  describe("Pipeline Guards Audio Alignment Integration", () => {
    it("aligns scene trim boundaries using clip speechSegments during validation", () => {
      const clips: GeminiClip[] = [
        {
          id: "clip-talking",
          index: 0,
          name: "speaking.mp4",
          duration: 10.0,
          mimeType: "video/mp4",
          speechSegments: [
            { text: "Welcome to our brand", startTime: 0.8, endTime: 3.5 },
          ],
        },
      ];

      // Model requested trimStart: 0.9s (inside first word!) and trimEnd: 3.4s (inside last word!)
      const scenes = [
        makeScene("s1", { clipTrimStart: 0.9, clipTrimEnd: 3.4 }),
      ];
      const assignments: ClipAssignment[] = [
        { sceneId: "s1", clipIndex: 0, trimStart: 0.9, trimEnd: 3.4 },
      ];

      const report = validateTrimBoundaries(scenes, clips, assignments);

      // Boundaries should be cleanly aligned to 0.8s and 3.5s!
      expect(report.scenes[0].clipTrimStart).toBe(0.8);
      expect(report.scenes[0].clipTrimEnd).toBe(3.5);
      expect(report.scenes[0].duration).toBe(2.7);
      expect(report.notes.some(n => n.includes("Audio-aware boundary alignment"))).toBe(true);
    });

    it("handles transcription failure conservatively without assuming silence or aggressive cuts", () => {
      const clips: GeminiClip[] = [
        {
          id: "clip-failed-transcription",
          index: 0,
          name: "unverified_interview.mp4",
          duration: 8.0,
          mimeType: "video/mp4",
          transcriptionStatus: "failed",
          transcriptionError: "Gemini API 503 Service Unavailable",
          speechSegments: [],
        },
      ];

      const scenes = [
        makeScene("s1", { clipTrimStart: 1.0, clipTrimEnd: 7.0 }),
      ];
      const assignments: ClipAssignment[] = [
        { sceneId: "s1", clipIndex: 0, trimStart: 1.0, trimEnd: 7.0 },
      ];

      const report = validateTrimBoundaries(scenes, clips, assignments);

      // Does not snap or aggressively modify cuts when transcription status is failed
      expect(report.scenes[0].clipTrimStart).toBe(1.0);
      expect(report.scenes[0].clipTrimEnd).toBe(7.0);
      expect(report.notes.some(n => n.includes("Speech status unverified"))).toBe(true);
    });

    it("safely handles remote clips where waveform analysis is unavailable", () => {
      // Remote clip (no local file path for ffprobe silencedetect)
      const speech = [{ text: "Key statement", startTime: 1.5, endTime: 4.5 }];
      const result = snapTrimToSpeechBoundaries(1.6, 4.4, speech, 6.0, 0.35, [], "completed_with_speech");

      expect(result.confidence).toBe("transcript_approximate");
      expect(result.snappedStart).toBe(true);
      expect(result.snappedEnd).toBe(true);
      expect(result.trimStart).toBe(1.5);
      expect(result.trimEnd).toBe(4.5);
    });

    it("distinguishes genuine silent clips from transcription failures", () => {
      // Genuine silent clip (transcription succeeded with 0 speech segments)
      const genuineSilent = snapTrimToSpeechBoundaries(0, 5, [], 5.0, 0.35, [], "completed_no_speech");
      expect(genuineSilent.confidence).toBe("silent");
      expect(genuineSilent.snappedStart).toBe(false);

      // Failed transcription (speech presence is unknown)
      const failedTranscription = snapTrimToSpeechBoundaries(0, 5, [], 5.0, 0.35, [], "failed");
      expect(failedTranscription.confidence).toBe("unverified");
      expect(failedTranscription.snappedStart).toBe(false);
    });
  });
});
