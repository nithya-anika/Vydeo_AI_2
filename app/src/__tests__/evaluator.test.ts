import { describe, it, expect, vi, beforeEach } from "vitest";
import { runEvaluator } from "../lib/agents/evaluator";
import { geminiRequest } from "../lib/gemini";
import type { WorkflowDefinition } from "../lib/workflows/types";
import type { Timeline } from "../types/timeline";
import type { BrandWorkspace } from "../types/brand";

// Mock the Gemini request function
vi.mock("../lib/gemini", () => ({
  geminiRequest: vi.fn(),
}));

describe("Evaluator Agent Point-Based Prompt Compliance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dummyTimeline: Timeline = {
    id: "test-timeline",
    totalDuration: 30,
    scenes: [
      {
        id: "scene-1",
        label: "Scene 1",
        duration: 10,
        clipSrc: "https://example.com/clip1.mp4",
        captions: [{ text: "Hello world", start: 0, end: 5 }],
        mood: "energetic",
      },
      {
        id: "scene-2",
        label: "Scene 2",
        duration: 20,
        clipSrc: "https://example.com/clip2.mp4",
        captions: [],
        mood: "calm",
      },
    ],
  };

  const dummyBrand: BrandWorkspace = {
    id: "test-brand",
    name: "Test Brand",
    styleKeywords: ["clean", "modern"],
    prohibitedElements: ["nudity"],
    colors: { primary: "#000", secondary: "#fff", accent: "#f00" },
    logoUrl: "",
    fonts: { heading: "Arial", body: "Arial" },
    socialHandles: {},
    slug: "test-brand",
    createdAt: new Date().toISOString(),
  };

  const dummyWorkflow: WorkflowDefinition = {
    id: "ugc-ads",
    name: "UGC Ads",
    cluster: "ugc-ads",
    description: "UGC Ads Workflow",
    purpose: "Create engaging UGC style advertisements",
    tools: [],
    models: { planner: "gemini-2.5-pro", generator: "gemini-2.5-pro", evaluator: "gemini-2.5-pro" },
    clusterConfig: {
      pacingStyle: "fast-cuts",
      defaultTransitions: [],
      captionStyle: "punchy",
      colorGradeDefault: "vibrant",
      sceneCountRange: [2, 5],
      systemPrompt: "",
    },
    evaluationCriteria: [
      {
        name: "hook-quality",
        description: "Engaging intro",
        weight: 1.0,
        rubric: { excellent: "Excellent", good: "Good", poor: "Poor" },
      },
    ],
    exampleInputs: [],
    exampleOutputDescription: "",
    failureCases: [],
    knownLimitations: [],
    supportedModes: ["editorial"],
  };

  it("should divide prompt into points, check passed/failed status, compute score, and prepend to issues/compliments", async () => {
    // Mock successful Gemini response
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  promptCheckpoints: [
                    {
                      point: "Create a travel montage",
                      passed: true,
                      reason: "The timeline depicts high-quality travel landscapes."
                    },
                    {
                      point: "Warm color grading",
                      passed: false,
                      reason: "The color grade is set to vibrant."
                    },
                    {
                      point: "Add captions",
                      passed: true,
                      reason: "Scene 1 contains captions."
                    }
                  ],
                  criteriaScores: [
                    {
                      criterion: "hook-quality",
                      score: 80,
                      weight: 1.0,
                      weightedScore: 80,
                      rating: "good",
                      notes: "Hook is decent."
                    }
                  ],
                  platformScores: [],
                  issues: ["Original issue 1"],
                  improvements: ["Original improvement 1"],
                  compliments: ["Original compliment 1"]
                }),
              },
            ],
          },
        },
      ],
    };

    vi.mocked(geminiRequest).mockResolvedValue(mockGeminiResponse);

    const result = await runEvaluator({
      timeline: dummyTimeline,
      brand: dummyBrand,
      workflow: dummyWorkflow,
      originalPrompt: "Create a travel montage with warm color grading and add captions.",
    });

    // Verify compliance score calculation (2 passed out of 3 = 67%)
    expect(result.promptComplianceScore).toBe(67);
    expect(result.overallScore).toBe(67); // overallScore should be set to promptComplianceScore

    // Verify prepending score and passing checkpoints to compliments
    expect(result.compliments[0]).toContain("🎯 PROMPT COMPLIANCE SCORE: 67%");
    expect(result.compliments[1]).toContain("✅ [PASSED] Point: \"Create a travel montage\"");
    expect(result.compliments[2]).toContain("✅ [PASSED] Point: \"Add captions\"");
    expect(result.compliments[3]).toBe("Original compliment 1");

    // Verify prepending failing checkpoints to issues
    expect(result.issues[0]).toContain("❌ [FAILED] Point: \"Warm color grading\"");
    expect(result.issues[1]).toBe("Original issue 1");

    expect(result.passedQA).toBe(true); // overallScore (67) >= 60
  });

  it("should fall back to neutral score on gemini failure", async () => {
    vi.mocked(geminiRequest).mockRejectedValue(new Error("Gemini error"));

    const result = await runEvaluator({
      timeline: dummyTimeline,
      brand: dummyBrand,
      workflow: dummyWorkflow,
      originalPrompt: "Test prompt",
    });

    expect(result.overallScore).toBe(70);
    expect(result.passedQA).toBe(true);
    expect(result.promptCheckpoints).toEqual([]);
  });
});
