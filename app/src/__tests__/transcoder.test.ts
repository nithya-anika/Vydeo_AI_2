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

  it("should return 'local' by default if no credentials are configured", () => {
    delete process.env.GCS_BUCKET;
    delete process.env.SUPABASE_URL;
    delete process.env.SHOTSTACK_API_KEY;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only GCS_BUCKET is configured", () => {
    process.env.GCS_BUCKET = "my-test-bucket";
    delete process.env.SUPABASE_URL;
    delete process.env.SHOTSTACK_API_KEY;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only SUPABASE_URL is configured", () => {
    delete process.env.GCS_BUCKET;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SHOTSTACK_API_KEY;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only SHOTSTACK_API_KEY is configured", () => {
    delete process.env.GCS_BUCKET;
    delete process.env.SUPABASE_URL;
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("local");
  });

  it("should return 'cloud' if GCS_BUCKET and SHOTSTACK_API_KEY are configured", () => {
    process.env.GCS_BUCKET = "my-test-bucket";
    delete process.env.SUPABASE_URL;
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("cloud");
  });

  it("should return 'cloud' if SUPABASE_URL and SHOTSTACK_API_KEY are configured", () => {
    delete process.env.GCS_BUCKET;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("cloud");
  });

  it("should return 'cloud' if GCS_BUCKET, SUPABASE_URL, and SHOTSTACK_API_KEY are configured", () => {
    process.env.GCS_BUCKET = "my-test-bucket";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("cloud");
  });
});
