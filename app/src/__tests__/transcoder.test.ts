import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEngineType } from "../lib/transcoder";

describe("Transcoder Engine Detection and GCS Helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return 'local' by default if GCS_BUCKET or SHOTSTACK_API_KEY are not configured", () => {
    delete process.env.GCS_BUCKET;
    delete process.env.SHOTSTACK_API_KEY;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only GCS_BUCKET is configured", () => {
    process.env.GCS_BUCKET = "my-test-bucket";
    delete process.env.SHOTSTACK_API_KEY;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only SHOTSTACK_API_KEY is configured", () => {
    delete process.env.GCS_BUCKET;
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("local");
  });

  it("should return 'cloud' if both GCS_BUCKET and SHOTSTACK_API_KEY are configured", () => {
    process.env.GCS_BUCKET = "my-test-bucket";
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("cloud");
  });
});
