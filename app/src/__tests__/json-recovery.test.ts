import { describe, expect, it } from "vitest";
import { safeParseJson } from "@/lib/json-repair";

describe("safeParseJson", () => {
  it("parses strict valid JSON", () => {
    const raw = `{"hello": "world", "count": 5}`;
    const parsed = safeParseJson<any>(raw);
    expect(parsed.hello).toBe("world");
    expect(parsed.count).toBe(5);
  });

  it("strips markdown json fences", () => {
    const raw = "```json\n{\n  \"test\": true\n}\n```";
    const parsed = safeParseJson<any>(raw);
    expect(parsed.test).toBe(true);
  });

  it("fixes trailing commas in arrays and objects", () => {
    const raw = `{"arr": [1, 2, ], "obj": {"a": 1, }}`;
    const parsed = safeParseJson<any>(raw);
    expect(parsed.arr).toEqual([1, 2]);
    expect(parsed.obj).toEqual({ a: 1 });
  });

  it("extracts the outermost object", () => {
    const raw = `Here is your JSON:\n\n{"test": true}\n\nHope this helps!`;
    const parsed = safeParseJson<any>(raw);
    expect(parsed.test).toBe(true);
  });

  it("escapes unescaped quotes inside 'reasoning'", () => {
    const raw = `{"reasoning": "He said "action" at 0.1s", "sceneOrder": [0, 1]}`;
    const parsed = safeParseJson<any>(raw);
    expect(parsed.reasoning).toBe(`He said "action" at 0.1s`);
    expect(parsed.sceneOrder).toEqual([0, 1]);
  });

  it("fails safely and explicitly on malicious payloads (prevents code execution)", () => {
    const malicious = `{"a": (function(){ throw new Error("EXECUTED"); })()}`;
    expect(() => safeParseJson(malicious)).toThrow("Failed to parse AI output into valid JSON safely");
  });

  it("fails safely on completely unrecoverable or invalid schemas", () => {
    const invalid = `{"a": undefined_variable, "b": +++}`;
    expect(() => safeParseJson(invalid)).toThrow("Failed to parse AI output into valid JSON safely");
  });

  it("recovers truncated array structures", () => {
    const truncated = `[{"clipIndex":0,"trimStart":1.2,"trimEnd":4.5},{"clipIndex":1,"trimStart":1.2`;
    const parsed = safeParseJson<any>(truncated);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].clipIndex).toBe(0);
    expect(parsed[1].clipIndex).toBe(1);
    expect(parsed[1].trimStart).toBe(1.2);
  });
});
