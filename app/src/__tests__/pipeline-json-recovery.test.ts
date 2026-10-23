import { describe, expect, it, vi, beforeEach } from "vitest";
import { timelineGeneratorTool } from "@/lib/tools/timeline-generator";
import { geminiRequest } from "@/lib/gemini";
import type { TimelineGeneratorInput } from "@/lib/tools/timeline-generator";
import { getWorkspace } from "@/lib/workspaces/asaya";

vi.mock("@/lib/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini")>();
  return {
    ...actual,
    geminiRequest: vi.fn(),
  };
});

describe("Timeline Generator Safe JSON Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dummyInput: TimelineGeneratorInput = {
    prompt: "Test prompt",
    brand: getWorkspace("asaya")!,
    aspectRatio: "9:16",
    clips: [
      { id: "c1", index: 0, name: "clip1.mp4", duration: 5, mimeType: "video/mp4" },
      { id: "c2", index: 1, name: "clip2.mp4", duration: 5, mimeType: "video/mp4" },
    ],
    clusterConfig: {
      pacingStyle: "fast-cuts",
      defaultTransitions: ["zoom-in"],
      captionStyle: "punchy",
      colorGradeDefault: "vibrant",
      sceneCountRange: [2, 4],
      systemPrompt: "Test",
    },
    classification: {
      cluster: "ugc-ads",
      mode: "editorial",
      intent: "ad",
      tone: "fast",
      platform: "tiktok",
    }
  };

  const dummyContext = { runId: "123", workspaceSlug: "default", cluster: "ugc-ads" as const, mode: "editorial" as const };

  it("successfully parses valid edit plans", async () => {
    vi.mocked(geminiRequest).mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              timeline: {
                selectedCandidates: [
                  { candidateId: "cand_c0_full", transitionType: "cut" },
                  { candidateId: "cand_c1_full", transitionType: "cut" }
                ]
              }
            })
          }]
        }
      }]
    });

    const result = await timelineGeneratorTool.execute(dummyInput, dummyContext);
    expect(result.success).toBe(true);
    expect(result.data?.timeline.scenes?.length).toBe(2);
  });

  it("recovers from trailing commas safely", async () => {
    vi.mocked(geminiRequest).mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            text: `{
              "timeline": {
                "selectedCandidates": [
                  { "candidateId": "cand_c0_full", "transitionType": "cut" },
                ]
              }
            }`
          }]
        }
      }]
    });

    const result = await timelineGeneratorTool.execute(dummyInput, dummyContext);
    expect(result.success).toBe(true);
    expect(result.data?.timeline.scenes?.length).toBe(1);
  });

  it("escapes unescaped quotes in reasoning without executing", async () => {
    vi.mocked(geminiRequest).mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            text: `{
              "reasoning": "He said "action" loudly",
              "timeline": {
                "selectedCandidates": [
                  { "candidateId": "cand_c0_full", "transitionType": "cut" }
                ]
              }
            }`
          }]
        }
      }]
    });

    const result = await timelineGeneratorTool.execute(dummyInput, dummyContext);
    expect(result.success).toBe(true);
    expect(result.data?.timeline.scenes?.length).toBe(1);
  });

  it("fails explicitly when malicious JS payload is provided, preventing unedited fallback", async () => {
    vi.mocked(geminiRequest).mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            text: `{"timeline": (function(){ return "HACKED"; })()}`
          }]
        }
      }]
    });

    const result = await timelineGeneratorTool.execute(dummyInput, dummyContext);
    // timelineGeneratorTool returns { success: false, error: ... } on parse failure
    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to parse AI output");
  });

  it("fails safely when intended timeline is unrecoverable", async () => {
    vi.mocked(geminiRequest).mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            text: `{"timeline": { "selec` // Completely cut off mid-key
          }]
        }
      }]
    });

    const result = await timelineGeneratorTool.execute(dummyInput, dummyContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to parse AI output");
  });
});
