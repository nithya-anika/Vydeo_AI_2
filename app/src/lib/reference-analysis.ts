import { geminiRequest } from "@/lib/gemini";
import { getModel } from "@/lib/ai-router";
import { safeParseJson } from "@/lib/json-repair";
import type { ReferenceMedia, ReferenceStyleProfile } from "@/types/references";

export async function analyzeReferences(
  references: ReferenceMedia[],
  templateName?: string,
  userCustomPrompt?: string
): Promise<ReferenceStyleProfile | null> {
  if (!references || references.length === 0) return null;

  try {
    const model = getModel("vision");
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    parts.push({
      text: `You are the Lead Creative Director of VydeoAI.
Analyze the following creative reference media uploaded by the user for the template "${templateName || "Custom Template"}".
User's editing intent: "${userCustomPrompt || "Follow the visual style of these references"}".

IMPORTANT MANDATE:
These references are purely for aesthetic, tonal, and directorial guidance.
DO NOT assume the subjects or scenes in these references will be in the final video.
Instead, extract the abstract creative DNA: color harmony, lighting, shot pacing, transition style, typography, and mood.

Extract and return JSON strictly matching this schema:
{
  "visualMood": "string (e.g. Warm Luxury, Energetic Cyberpunk, Crisp Minimalist)",
  "colorPalette": ["#hex1", "#hex2", "#hex3"],
  "lightingStyle": "string (e.g. Soft directional window light with warm fill)",
  "pacingPreference": "fast-cuts" | "medium-paced" | "cinematic-slow",
  "transitionStyle": "string (e.g. Smooth cross-dissolves, quick whip transitions, clean hard cuts)",
  "captionPlacement": "string (e.g. Centered lower-third, bold centered punch)",
  "captionTypography": "string (e.g. Clean minimalist sans-serif, bold energetic modern)",
  "musicEnergy": "low" | "medium" | "high",
  "creativeDirectives": ["rule 1", "rule 2", "rule 3"],
  "summary": "Concise 2-sentence synthesis of how the footage should be styled to match these references."
}`,
    });

    // Process up to 4 references to stay within safe token limits
    for (const ref of references.slice(0, 4)) {
      if (ref.url.startsWith("data:")) {
        const match = ref.url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1] || ref.mimeType || "image/jpeg",
              data: match[2],
            },
          });
          parts.push({ text: `Reference asset: ${ref.name} (${ref.type})` });
        }
      } else if (ref.url.startsWith("http")) {
        // Download small payload if remote S3 / public URL
        try {
          const res = await fetch(ref.url, { headers: { Range: "bytes=0-1048576" } }); // Read up to 1MB sample
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const b64 = Buffer.from(buf).toString("base64");
            const mime = ref.type === "video" ? "video/mp4" : (ref.mimeType || "image/jpeg");
            parts.push({
              inlineData: { mimeType: mime, data: b64 },
            });
            parts.push({ text: `Reference asset: ${ref.name} (${ref.type})` });
          }
        } catch (fetchErr) {
          console.warn(`[analyzeReferences] Could not fetch remote sample for ${ref.name}:`, fetchErr);
        }
      }
    }

    // If no media could be inlined, return metadata-based profile
    if (parts.length <= 1) {
      return buildHeuristicProfile(references, templateName, userCustomPrompt);
    }

    const response = await geminiRequest(model, {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    });

    const raw = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    const parsed = safeParseJson<ReferenceStyleProfile>(raw);
    if (parsed && typeof parsed.summary === "string" && Array.isArray(parsed.creativeDirectives)) {
      return parsed;
    }

    return buildHeuristicProfile(references, templateName, userCustomPrompt);
  } catch (err) {
    console.warn("[analyzeReferences] Analysis error, falling back to heuristic profile:", err);
    return buildHeuristicProfile(references, templateName, userCustomPrompt);
  }
}

export function buildHeuristicProfile(
  references: ReferenceMedia[],
  templateName?: string,
  userCustomPrompt?: string
): ReferenceStyleProfile {
  const hasVideo = references.some((r) => r.type === "video");
  const count = references.length;
  const promptLower = (userCustomPrompt || "").toLowerCase();

  const isFast = promptLower.includes("fast") || promptLower.includes("quick") || promptLower.includes("energetic") || promptLower.includes("tiktok");
  const isSlow = promptLower.includes("slow") || promptLower.includes("luxury") || promptLower.includes("cinematic") || promptLower.includes("calm");

  const pacing = isFast ? "fast-cuts" : isSlow ? "cinematic-slow" : "medium-paced";
  const musicEnergy = isFast ? "high" : isSlow ? "low" : "medium";

  return {
    visualMood: isSlow ? "Polished & Cinematic" : isFast ? "High-Energy & Dynamic" : "Contemporary Commercial",
    colorPalette: isSlow ? ["#0D0D1A", "#C9A96E", "#F59E0B"] : ["#10B981", "#6366F1", "#FFFFFF"],
    lightingStyle: isSlow ? "Controlled cinematic lighting with soft shadows" : "Bright, high-contrast, clean modern exposure",
    pacingPreference: pacing,
    transitionStyle: isSlow ? "Smooth dissolves and motivated match cuts" : "Punchy jump cuts and directional zooms",
    captionPlacement: "Centered lower-third with clean high-contrast backdrop",
    captionTypography: isFast ? "Bold modern sans-serif" : "Elegant refined typography",
    musicEnergy,
    creativeDirectives: [
      `Align color harmony and contrast with the ${count} attached reference asset(s).`,
      `Structure the sequence according to ${pacing} pacing.`,
      `Prioritize clarity and visual polish reflecting the user's reference examples.`,
    ],
    summary: `Stylistic profile constructed from ${count} reference file(s) for ${templateName || "video edit"}. Emphasizes ${pacing} pacing with clean visual presentation.`,
  };
}
