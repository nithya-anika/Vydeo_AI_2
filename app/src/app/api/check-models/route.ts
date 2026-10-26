import { NextResponse } from "next/server";
import { createVertexJWT } from "@/lib/gemini";

const PROJECT = process.env.GOOGLE_PROJECT_ID!;
const LOCATION = process.env.GOOGLE_LOCATION ?? "global";
const BASE = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models`;

async function checkGemini(model: string): Promise<string> {
  try {
    const isGlobal = true;
    const token = createVertexJWT(isGlobal);
    const host = "aiplatform.googleapis.com";
    const loc = "global";
    const url = `https://${host}/v1/projects/${PROJECT}/locations/${loc}/publishers/google/models/${model}:generateContent`;

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json() as { candidates?: unknown[]; error?: { message?: string; status?: string } };
    if (j.candidates) return "✅ available";
    return `❌ ${j.error?.status ?? j.error?.message ?? res.status}`;
  } catch (e) { return `❌ ${String(e).slice(0, 60)}`; }
}

async function checkVeo(token: string, model: string): Promise<string> {
  try {
    const isGlobal = true;
    const loc = "global";
    const host = "aiplatform.googleapis.com";
    const url = `https://${host}/v1/projects/${PROJECT}/locations/${loc}/publishers/google/models/${model}:predictLongRunning`;
    const freshToken = createVertexJWT(isGlobal);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${freshToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt: "a red ball" }], parameters: { sampleCount: 1, durationSeconds: 4 } }),
    });
    const j = await res.json() as { name?: string; error?: { message?: string; status?: string } };
    // If we get a long-running operation name back, it's available
    if (j.name) return "✅ available (job started)";
    return `❌ ${j.error?.status ?? j.error?.message ?? res.status}`;
  } catch (e) { return `❌ ${String(e).slice(0, 60)}`; }
}

async function checkImagen(token: string, model: string): Promise<string> {
  try {
    const isGlobal = true;
    const loc = "global";
    const host = "aiplatform.googleapis.com";
    const url = `https://${host}/v1/projects/${PROJECT}/locations/${loc}/publishers/google/models/${model}:predict`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt: "a red circle" }], parameters: { sampleCount: 1 } }),
    });
    const j = await res.json() as { predictions?: unknown[]; error?: { message?: string; status?: string } };
    if (j.predictions) return "✅ available";
    return `❌ ${j.error?.status ?? j.error?.message ?? res.status}`;
  } catch (e) { return `❌ ${String(e).slice(0, 60)}`; }
}

export async function GET() {
  try {
    const token = createVertexJWT();
    const [
      pro31, flash38, argon4, flash35,
      pro25, flash25,
      veo31, veo30,
      img3, img4, img4ultra,
    ] = await Promise.all([
      checkGemini("gemini-3.1-pro-preview"),
      checkGemini("gemini-3.8-flash"),
      checkGemini("gemini-4-argon"),
      checkGemini("gemini-3.5-flash"),
      checkGemini("gemini-2.5-pro"),
      checkGemini("gemini-2.5-flash"),
      checkVeo(token, "veo-3.1-generate-001"),
      checkVeo(token, "veo-3.0-generate-001"),
      checkImagen(token, "imagen-3.0-generate-001"),
      checkImagen(token, "imagen-4.0-generate-001"),
      checkImagen(token, "imagen-4.0-ultra-001"),
    ]);

    return NextResponse.json({
      gemini: {
        "gemini-3.1-pro-preview": pro31,
        "gemini-3.8-flash": flash38,
        "gemini-4-argon": argon4,
        "gemini-3.5-flash": flash35,
        "gemini-2.5-pro": pro25,
        "gemini-2.5-flash": flash25,
      },
      veo: {
        "veo-3.1-generate-001": veo31,
        "veo-3.0-generate-001": veo30,
      },
      imagen: {
        "imagen-3.0-generate-001": img3,
        "imagen-4.0-generate-001": img4,
        "imagen-4.0-ultra-001": img4ultra,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
