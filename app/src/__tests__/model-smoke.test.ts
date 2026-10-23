import { describe, it, expect, beforeEach } from "vitest";
import {
  getModel,
  setModelOverride,
  resetModelOverrides,
  engageVerifiedSafetyFallback,
  rollbackToLegacyDefaults,
  restoreProductionDefaults,
  isFallbackActive,
  isRollbackActive,
  AI_MODELS,
  FALLBACK_MODELS,
} from "@/lib/ai-router";

describe("Production Model Migration, Fallback Safety & Smoke Verification", () => {
  beforeEach(() => {
    resetModelOverrides();
  });

  it("verifies production defaults are configured to modern models without retired defaults", () => {
    expect(AI_MODELS.planning).toBe("gemini-3.1-pro-preview");
    expect(AI_MODELS.chat).toBe("gemini-3.8-flash");
    expect(AI_MODELS.storyboard).toBe("gemini-3.1-pro-preview");
    expect(AI_MODELS.vision).toBe("gemini-3.1-pro-preview");
    expect(AI_MODELS.evaluate).toBe("gemini-4-argon");

    // Default fallback path must use verified Gemini 3.5 Flash, not retired 2.5 models!
    expect(FALLBACK_MODELS.primary).toBe("gemini-3.6-flash");
    expect(FALLBACK_MODELS.reviewer).toBe("gemini-3.8-flash");
  });

  it("successfully engages modern verified safety fallback without relying on retired models", () => {
    expect(isFallbackActive()).toBe(false);

    engageVerifiedSafetyFallback();
    expect(isFallbackActive()).toBe(true);

    // All primary generation switches to verified gemini-3.6-flash
    expect(getModel("planning")).toBe("gemini-3.6-flash");
    expect(getModel("chat")).toBe("gemini-3.6-flash");
    expect(getModel("storyboard")).toBe("gemini-3.6-flash");
    expect(getModel("vision")).toBe("gemini-3.6-flash");
    expect(getModel("evaluate")).toBe("gemini-3.8-flash");

    restoreProductionDefaults();
    expect(isFallbackActive()).toBe(false);
    expect(getModel("planning")).toBe("gemini-3.1-pro-preview");
    expect(getModel("evaluate")).toBe("gemini-4-argon");
  });

  it("preserves deprecated legacy rollback option for controlled regression testing", () => {
    rollbackToLegacyDefaults();
    expect(isRollbackActive()).toBe(true);
    expect(getModel("planning")).toBe("gemini-2.5-pro");

    restoreProductionDefaults();
    expect(isRollbackActive()).toBe(false);
    expect(getModel("planning")).toBe("gemini-3.1-pro-preview");
  });

  it("allows targeted task-level overrides without disrupting global defaults", () => {
    setModelOverride("evaluate", "gemini-3.8-flash");
    expect(getModel("evaluate")).toBe("gemini-3.8-flash");
    // Planning remains untouched
    expect(getModel("planning")).toBe("gemini-3.1-pro-preview");

    resetModelOverrides();
    expect(getModel("evaluate")).toBe("gemini-4-argon");
  });
});
