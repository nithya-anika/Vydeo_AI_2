import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the GoogleAuth class
vi.mock("google-auth-library", () => {
  return {
    GoogleAuth: vi.fn().mockImplementation(() => {
      return {
        getClient: vi.fn().mockResolvedValue({
          getAccessToken: vi.fn().mockResolvedValue({ token: "test-token" }),
        }),
      };
    }),
  };
});

describe("Google Drive Import Helper Functions", () => {
  // Simple extraction regex test mirroring route.ts logic
  function extractFolderId(url: string): string | null {
    const match = url.match(/folders\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
    const queryMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (queryMatch) return queryMatch[1];
    return null;
  }

  it("should extract folder ID from standard Google Drive folders URL", () => {
    const url = "https://drive.google.com/drive/folders/1A2B3C_4D5E6F-7G8H9I0J?usp=sharing";
    expect(extractFolderId(url)).toBe("1A2B3C_4D5E6F-7G8H9I0J");
  });

  it("should extract folder ID from view query Google Drive folders URL", () => {
    const url = "https://drive.google.com/drive/u/0/folders/1abc-123_XYZ";
    expect(extractFolderId(url)).toBe("1abc-123_XYZ");
  });

  it("should extract folder ID from query ID Google Drive folders URL", () => {
    const url = "https://drive.google.com/open?id=1xyz_987-abc";
    expect(extractFolderId(url)).toBe("1xyz_987-abc");
  });

  it("should return null for invalid Google Drive URL format", () => {
    const url = "https://google.com/drive/my-folder-is-cool";
    expect(extractFolderId(url)).toBeNull();
  });
});
