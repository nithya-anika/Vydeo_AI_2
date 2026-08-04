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
    delete process.env.STORJ_ENDPOINT;
    delete process.env.SHOTSTACK_API_KEY;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only GCS_BUCKET is configured", () => {
    process.env.GCS_BUCKET = "my-test-bucket";
    delete process.env.STORJ_ENDPOINT;
    delete process.env.SHOTSTACK_API_KEY;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only STORJ_ENDPOINT is configured", () => {
    delete process.env.GCS_BUCKET;
    process.env.STORJ_ENDPOINT = "https://gateway.storjshare.io";
    delete process.env.SHOTSTACK_API_KEY;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only SHOTSTACK_API_KEY is configured", () => {
    delete process.env.GCS_BUCKET;
    delete process.env.STORJ_ENDPOINT;
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("local");
  });

  it("should return 'cloud' if GCS_BUCKET and SHOTSTACK_API_KEY are configured", () => {
    process.env.GCS_BUCKET = "my-test-bucket";
    delete process.env.STORJ_ENDPOINT;
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("cloud");
  });

  it("should return 'cloud' if STORJ_ENDPOINT and SHOTSTACK_API_KEY are configured", () => {
    delete process.env.GCS_BUCKET;
    process.env.STORJ_ENDPOINT = "https://gateway.storjshare.io";
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("cloud");
  });

  it("should return 'cloud' if GCS_BUCKET, STORJ_ENDPOINT, and SHOTSTACK_API_KEY are configured", () => {
    process.env.GCS_BUCKET = "my-test-bucket";
    process.env.STORJ_ENDPOINT = "https://gateway.storjshare.io";
    process.env.SHOTSTACK_API_KEY = "test-key";
    expect(getEngineType()).toBe("cloud");
  });
});
