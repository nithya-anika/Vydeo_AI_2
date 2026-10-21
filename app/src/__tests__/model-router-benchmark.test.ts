import { describe, it, expect, beforeEach } from "vitest";
import { getModel, setModelOverride, resetModelOverrides } from "@/lib/ai-router";
import { runModelBenchmark, BENCHMARK_CORPUS, type BenchmarkTestCase } from "@/lib/benchmark";

describe("AI Model Router & Benchmark Harness", () => {
  beforeEach(() => {
    resetModelOverrides();
  });

  describe("Model Router Configuration & Dynamic Overrides", () => {
    it("returns default production models when no override is set", () => {
      expect(getModel("planning")).toBe("gemini-3.1-pro-preview");
      expect(getModel("chat")).toBe("gemini-3.8-flash");
      expect(getModel("vision")).toBe("gemini-3.1-pro-preview");
    });

    it("allows runtime overrides for testing without modifying default codebase constants", () => {
      setModelOverride("planning", "gemini-test-override");
      expect(getModel("planning")).toBe("gemini-test-override");

      // Other models remain unaffected
      expect(getModel("chat")).toBe("gemini-3.8-flash");

      resetModelOverrides();
      expect(getModel("planning")).toBe("gemini-3.1-pro-preview");
    });

    it("supports direct parameter override", () => {
      expect(getModel("planning", "gemini-direct")).toBe("gemini-direct");
    });
  });

  describe("Benchmark Corpus & Category Coverage", () => {
    it("includes creator, brand-ad, talking-head, and cinematic projects", () => {
      const categories = BENCHMARK_CORPUS.map((c) => c.category);
      expect(categories).toContain("creator");
      expect(categories).toContain("brand-ad");
      expect(categories).toContain("talking-head");
      expect(categories).toContain("cinematic");
    });
  });

  describe("Model Benchmark Harness Error Handling", () => {
    it("captures and classifies non-existent model IDs cleanly", async () => {
      const testCases: BenchmarkTestCase[] = [
        {
          id: "test-case-1",
          category: "creator",
          name: "Sample Test",
          prompt: "Quick review ad",
          targetDuration: 10,
          clips: [
            { index: 0, name: "clip1.mp4", duration: 5, mimeType: "video/mp4" },
          ],
        },
      ];

      const report = await runModelBenchmark(["gemini-non-existent-test-id"], testCases);

      expect(report.modelsTested).toContain("gemini-non-existent-test-id");
      const res = report.results["gemini-non-existent-test-id"];
      expect(res.automated.available).toBe(false);
      expect(["unavailable_404", "error"]).toContain(res.automated.status);
    });
  });
});
