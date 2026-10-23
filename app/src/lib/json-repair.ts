/**
 * Safe, bounded JSON recovery tool.
 * Never uses eval() or new Function(). Never executes arbitrary code.
 */
export function safeParseJson<T>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Cannot parse empty or non-string input");
  }

  // 1. Strip markdown code fences
  let clean = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  // 2. Try standard strict JSON.parse
  try { return JSON.parse(clean) as T; } catch {}

  // 3. Extract the outermost object or array
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  const firstBracket = clean.indexOf("[");
  const lastBracket = clean.lastIndexOf("]");
  
  let extracted = clean;
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace && (firstBracket === -1 || firstBrace < firstBracket)) {
    extracted = clean.slice(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    extracted = clean.slice(firstBracket, lastBracket + 1);
  }

  try { return JSON.parse(extracted) as T; } catch {}

  // 4. Apply bounded syntax fixes (no execution)
  
  // 4a. Fix trailing commas (e.g., [1, 2,] -> [1, 2])
  let fixed = extracted.replace(/,\s*([\]}])/g, "$1");
  try { return JSON.parse(fixed) as T; } catch {}

  // 4b. Fix missing brackets for truncated arrays (rudimentary truncation recovery)
  // Example: [ { "a": 1 }, { "b": 2
  if (extracted.startsWith("[")) {
    const unclosedArrayMatch = fixed.match(/\[\s*\{.*\}\s*(,\s*\{[^}]*)?$/s);
    if (unclosedArrayMatch) {
       let attempt = fixed;
       const openBraces = (attempt.match(/\{/g) || []).length;
       const closeBraces = (attempt.match(/\}/g) || []).length;
       for (let i = 0; i < openBraces - closeBraces; i++) attempt += "}";
       attempt += "]";
       // Clean trailing commas again just in case
       attempt = attempt.replace(/,\s*([\]}])/g, "$1");
       try { return JSON.parse(attempt) as T; } catch {}
    }
  }

  // 4c. Fix unescaped quotes specifically within known text fields like "reasoning"
  // e.g. "reasoning": "He said "action" loudly", "sceneOrder"
  fixed = fixed.replace(/"reasoning"\s*:\s*"([\s\S]*?)"\s*,\s*"/g, (_m, content, offset, fullString) => {
    // Escape internal quotes
    const escaped = content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `"reasoning": "${escaped}", "`;
  });
  
  try { return JSON.parse(fixed) as T; } catch {}
  
  // 5. Final fallback string sanitization (newlines and control characters)
  fixed = fixed.replace(/[\u0000-\u001F]+/g, (m) => (m === "\n" ? "\\n" : m === "\r" ? "\\r" : m === "\t" ? "\\t" : ""));
  try { return JSON.parse(fixed) as T; } catch {}

  throw new Error("Failed to parse AI output into valid JSON safely");
}
