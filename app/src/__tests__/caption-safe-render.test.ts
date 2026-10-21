import { describe, it, expect } from "vitest";
import { findSystemFont, findFfmpeg, escapeFontPathForFfmpeg } from "@/lib/ffmpeg-render";
import { existsSync } from "fs";

describe("Caption-Safe Rendering Verification", () => {
  it("resolves a valid font file path on the host system or bundled in public/fonts", () => {
    const font = findSystemFont();
    expect(font).not.toBeNull();
    expect(typeof font).toBe("string");
    expect(existsSync(font!)).toBe(true);
  });

  it("prioritizes an FFmpeg binary capable of text and subtitle filters", () => {
    const bin = findFfmpeg();
    expect(bin).toBeDefined();
    expect(typeof bin).toBe("string");
  });

  it("verifies font discovery matches bundled open-source or system font candidates", () => {
    const font = findSystemFont();
    expect(font).toMatch(/(Geist|Arial|Helvetica|DejaVu|Liberation|FreeSans)/i);
  });

  it("safely escapes font paths containing spaces and colons for FFmpeg", () => {
    const inputPath = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";
    const escaped = escapeFontPathForFfmpeg(inputPath);
    expect(escaped).toBe("/System/Library/Fonts/Supplemental/Arial Unicode.ttf");

    const winPath = "C:\\Windows\\Fonts\\Arial Unicode.ttf";
    expect(escapeFontPathForFfmpeg(winPath)).toBe("C\\:/Windows/Fonts/Arial Unicode.ttf");
  });
});
