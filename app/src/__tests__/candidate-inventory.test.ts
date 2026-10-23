import { describe, it, expect } from "vitest";
import {
  buildCandidateSegmentInventory,
  resolveSelectedCandidatesToScenes,
  type SelectedCandidateOrder,
} from "@/lib/candidateInventory";
import type { GeminiClip } from "@/lib/gemini";
import type { VideoAnalysisOutput } from "@/lib/tools/video-analysis";
import type { BrandWorkspace } from "@/types/brand";

const mockBrand: BrandWorkspace = {
  id: "asaya",
  name: "Asaya",
  slug: "asaya",
  palette: { primary: "#000", secondary: "#fff", accent: "#gold", background: "#fff", surface: "#eee", text: "#111" },
  fonts: {
    heading: { family: "Inter", weight: "700" },
    body: { family: "Inter", weight: "400" },
    caption: { family: "Inter", weight: "500" },
  },
  typography: { fontFamily: "Inter", headingFont: "Inter", bodyFont: "Inter", captionFont: "Inter" },
  logoUrl: "",
  captionStyle: { position: "bottom", style: "brand-default", maxCharsPerLine: 35, maxLines: 2, animationIn: "fade" },
  colorGrade: { name: "vibrant" },
  audioTracks: [],
  defaultAspectRatio: "9:16",
  guidelines: { tone: "luxury", values: ["authentic"], aesthetics: ["clean"] },
  styleKeywords: ["clean", "premium"],
  prohibitedElements: [],
  rules: [],
  assets: [],
  team: [],
  subscription: { tier: "pro", validUntil: "2027-01-01" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as BrandWorkspace;

describe("Candidate-Based Editorial Planning Inventory", () => {
  const mockClips: GeminiClip[] = [
    {
      id: "clip-interview",
      index: 0,
      name: "interview_take.mp4",
      duration: 15.0,
      mimeType: "video/mp4",
      speechSegments: [
        { text: "This product changed our skincare routine completely.", startTime: 1.0, endTime: 5.5 },
        { text: "You can find it at the link below right now.", startTime: 10.0, endTime: 13.5 },
      ],
    },
    {
      id: "clip-broll",
      index: 1,
      name: "macro_product.mp4",
      duration: 6.0,
      mimeType: "video/mp4",
    },
    {
      id: "clip-blurry",
      index: 2,
      name: "accidental_blur.mp4",
      duration: 4.0,
      mimeType: "video/mp4",
    },
  ];

  const mockAnalysis: VideoAnalysisOutput = {
    clips: [
      {
        clipId: "clip-interview",
        clipIndex: 0,
        name: "interview_take.mp4",
        estimatedDuration: 15.0,
        scenes: [
          {
            startTime: 0.5,
            endTime: 5.5,
            description: "Speaker introducing the product with direct eye contact",
            action: "holding bottle and speaking",
            cameraMovement: "static",
            visualQuality: "high",
            confidence: 0.95,
            energyLevel: "medium",
            hasHuman: true,
            hasProduct: true,
            suitableAsHook: true,
            hookRationale: "Great opening connection",
          },
          {
            startTime: 6.0,
            endTime: 9.5,
            description: "Speaker laughing with hands gesturing",
            action: "natural reaction",
            cameraMovement: "handheld",
            visualQuality: "high",
            confidence: 0.9,
            energyLevel: "high",
            hasHuman: true,
            hasProduct: false,
            suitableAsHook: false,
          },
          {
            startTime: 10.0,
            endTime: 14.0,
            description: "Speaker pointing down to link CTA",
            action: "closing call to action",
            cameraMovement: "static",
            visualQuality: "high",
            confidence: 0.95,
            energyLevel: "medium",
            hasHuman: true,
            hasProduct: true,
            suitableAsHook: false,
          },
        ],
        motion: "medium",
        cameraMovement: "static",
        dominantColors: ["#ffffff"],
        audioPresent: true,
        quality: "high",
        usability: 0.95,
        suggestedUse: "Core interview segments",
        bestSegmentStart: 0.5,
        bestSegmentEnd: 5.5,
      },
      {
        clipId: "clip-broll",
        clipIndex: 1,
        name: "macro_product.mp4",
        estimatedDuration: 6.0,
        scenes: [
          {
            startTime: 0.0,
            endTime: 4.5,
            description: "Macro bottle texture sliding across granite counter",
            action: "product glide",
            cameraMovement: "pan",
            visualQuality: "cinematic",
            confidence: 0.98,
            energyLevel: "low",
            hasHuman: false,
            hasProduct: true,
            suitableAsHook: true,
          },
        ],
        motion: "slow",
        cameraMovement: "pan",
        dominantColors: ["#000000"],
        audioPresent: false,
        quality: "high",
        usability: 0.9,
        suggestedUse: "Cutaway B-roll",
        bestSegmentStart: 0.0,
        bestSegmentEnd: 4.5,
      },
    ],
    overallQuality: 0.92,
    editableClipCount: 3,
    footageSummary: "High quality interview and B-roll with one blurry clip.",
    suggestedCluster: "ugc-ads",
    suggestedEditStyle: "fast cuts",
    hookCandidates: [],
  };

  it("builds a structured candidate inventory with stable IDs and exact bounds", () => {
    const inventory = buildCandidateSegmentInventory(mockClips, mockAnalysis);

    expect(inventory.candidates.length).toBeGreaterThanOrEqual(4);
    // Interview has 3 detected sub-scenes
    expect(inventory.candidatesByClip.get(0)).toHaveLength(3);
    // B-roll has 1 detected sub-scene
    expect(inventory.candidatesByClip.get(1)).toHaveLength(1);
    // Blurry clip has 1 fallback whole clip candidate
    expect(inventory.candidatesByClip.get(2)).toHaveLength(1);

    const first = inventory.candidateLookup.get("cand_c0_s0")!;
    expect(first).toBeDefined();
    expect(first.clipIndex).toBe(0);
    expect(first.sourceTrimStart).toBe(0.5);
    expect(first.sourceTrimEnd).toBe(5.5);
    expect(first.duration).toBe(5.0);
    expect(first.suitableAsHook).toBe(true);
    expect(first.speechText).toContain("changed our skincare routine");
  });

  it("resolves selected candidates into scenes with exact media boundaries", () => {
    const inventory = buildCandidateSegmentInventory(mockClips, mockAnalysis);

    // AI editor selects: Hook (cand_c0_s0), Cutaway (cand_c1_s0), Outro (cand_c0_s2)
    // OMITTING cand_c0_s1 (laughter filler) and cand_c2_full (blurry clip)!
    const selections: SelectedCandidateOrder[] = [
      { candidateId: "cand_c0_s0", role: "hook", label: "Opening Hook", captionText: "MUST TRY" },
      { candidateId: "cand_c1_s0", role: "feature", label: "Product B-roll", transitionType: "fade" },
      { candidateId: "cand_c0_s2", role: "cta", label: "Call to Action", captionText: "LINK BELOW" },
    ];

    const result = resolveSelectedCandidatesToScenes({
      selections,
      inventory,
      clips: mockClips,
      brand: mockBrand,
    });

    expect(result.scenes).toHaveLength(3);
    expect(result.clipAssignments).toHaveLength(3);
    expect(result.resolvedCandidateCount).toBe(3);
    // 2 candidates were omitted!
    expect(result.omittedCandidateCount).toBe(2);

    // Scene 0: first segment of interview
    expect(result.scenes[0].clipTrimStart).toBe(0.5);
    expect(result.scenes[0].clipTrimEnd).toBe(5.5);
    expect(result.scenes[0].duration).toBe(5.0);
    expect(result.clipAssignments[0].clipIndex).toBe(0);

    // Scene 1: B-roll
    expect(result.scenes[1].clipTrimStart).toBe(0.0);
    expect(result.scenes[1].clipTrimEnd).toBe(4.5);
    expect(result.clipAssignments[1].clipIndex).toBe(1);

    // Scene 2: sub-clipping returns to interview take for CTA!
    expect(result.scenes[2].clipTrimStart).toBe(10.0);
    expect(result.scenes[2].clipTrimEnd).toBe(14.0);
    expect(result.clipAssignments[2].clipIndex).toBe(0);
  });

  it("rejects unconstrained trim inventions beyond candidate media bounds", () => {
    const inventory = buildCandidateSegmentInventory(mockClips, mockAnalysis);

    // Attempting custom trims outside candidate bounds: [-5.0, 99.0]
    const selections: SelectedCandidateOrder[] = [
      { candidateId: "cand_c0_s0", customTrimStart: -5.0, customTrimEnd: 99.0 },
    ];

    const result = resolveSelectedCandidatesToScenes({
      selections,
      inventory,
      clips: mockClips,
      brand: mockBrand,
    });

    // Custom trims must be clamped to candidate bounds: [0.5, 5.5]
    expect(result.scenes[0].clipTrimStart).toBe(0.5);
    expect(result.scenes[0].clipTrimEnd).toBe(5.5);
  });

  it("fails securely when provided with invalid or hallucinated candidate IDs", () => {
    const inventory = buildCandidateSegmentInventory(mockClips, mockAnalysis);

    const selections: SelectedCandidateOrder[] = [
      { candidateId: "cand_c99_does_not_exist" },
      { candidateId: "cand_c0_s0" },
    ];

    expect(() => resolveSelectedCandidatesToScenes({
      selections,
      inventory,
      clips: mockClips,
      brand: mockBrand,
    })).toThrowError(/Invalid or unknown candidate ID requested/);
  });
});
