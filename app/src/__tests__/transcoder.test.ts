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
    delete process.env.S3_BUCKET_NAME;
    delete process.env.REMOTION_AWS_ACCESS_KEY_ID;
    delete process.env.AWS_ACCESS_KEY_ID;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only S3_BUCKET_NAME is configured", () => {
    process.env.S3_BUCKET_NAME = "my-test-bucket";
    delete process.env.REMOTION_AWS_ACCESS_KEY_ID;
    delete process.env.AWS_ACCESS_KEY_ID;
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if only REMOTION_AWS_ACCESS_KEY_ID is configured", () => {
    delete process.env.GCS_BUCKET;
    delete process.env.S3_BUCKET_NAME;
    process.env.REMOTION_AWS_ACCESS_KEY_ID = "test-key";
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if S3_BUCKET_NAME and REMOTION_AWS_ACCESS_KEY_ID are configured (forced local)", () => {
    process.env.S3_BUCKET_NAME = "my-test-bucket";
    process.env.REMOTION_AWS_ACCESS_KEY_ID = "test-key";
    expect(getEngineType()).toBe("local");
  });

  it("should return 'local' if GCS_BUCKET and AWS_ACCESS_KEY_ID are configured (forced local)", () => {
    process.env.GCS_BUCKET = "my-gcs-bucket";
    process.env.AWS_ACCESS_KEY_ID = "fallback-test-key";
    expect(getEngineType()).toBe("local");
  });
});
