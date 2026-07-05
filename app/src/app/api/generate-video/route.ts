import { NextRequest, NextResponse } from "next/server";
import { createVertexJWT, createStorageJWT, geminiRequest } from "@/lib/gemini";

export const maxDuration = 300;

type VeoVideo = {
  uri?: string;
  bytesBase64Encoded?: string;
  mimeType?: string;
};

type PollResponse = {
  done?: boolean;
  error?: { message?: string; code?: number };
  response?: {
    videos?: VeoVideo[];
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string; gcsUri?: string }>;
    generatedSamples?: Array<{ video?: VeoVideo }>;
  };
};

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

const VEO_SUPPORTED_DURATION_SECONDS = [4, 6, 8] as const;
const PROMPT_ENHANCER_MODEL = "gemini-2.5-pro";
const VEO_MODELS_WITH_AUDIO = [
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
  "veo-3.0-generate-001",
  "veo-3.0-generate-preview",
  "veo-3.0-fast-generate-001",
];
const VEO_MODELS_SILENT_OK = [
  ...VEO_MODELS_WITH_AUDIO,
  "veo-2.0-generate-001",
];

function normalizeVeoDurationSeconds(duration?: string) {
  const requested = Number.parseFloat(duration ?? "8");
  const safeRequested = Number.isFinite(requested) && requested > 0 ? requested : 8;
  return VEO_SUPPORTED_DURATION_SECONDS.find((seconds) => safeRequested <= seconds) ?? 8;
}

function dataUrlToInlineData(dataUrl: string): { data: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1] || "image/jpeg", data: match[2] };
}

function extractGeminiText(data: unknown) {
  return (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

async function enhancePromptForVeo(params: {
  prompt: string;
  durationSecs: number;
  aspectRatio: string;
  motion?: string;
  style?: string;
  audio: boolean;
  references?: string[];
}) {
  const parts: GeminiPart[] = [{
    text: [
      "You are a senior commercial film director and prompt engineer for Gemini Veo 3.",
      "Rewrite the user's idea into one production-ready Veo prompt for the best available Gemini video model.",
      "The generated video must be realistic, cinematic, coherent, premium, and immediately impressive.",
      "Make every second purposeful: no empty pauses, no dead air, no blank frames, no awkward timing gaps, no disconnected action.",
      "Specify seamless continuity, smooth transitions, continuous ambience, and synchronized audio from start to finish.",
      "For multi-scene ads, include exact beat-by-beat pacing so the whole clip feels tightly edited with no visual or audio gaps.",
      "Make it feel interactive and information-rich: include tasteful on-screen words, app UI labels, animated callouts, status changes, scores, buttons, chat bubbles, or captions when they help the story.",
      "Keep text readable and premium: word-rich enough to feel useful, but paced in short bursts that appear exactly when the viewer needs them.",
      "Transitions must be perfectly synchronized with the music beat, voiceover phrasing, UI taps, camera motion, and emotional shifts.",
      "Describe transitions as motivated cuts, match cuts, push-ins, whip-smooth moves, or UI-driven screen transitions. Never use random unsynced transitions.",
      "Target a 10/10 polished ad: strong hook, clear middle, satisfying final payoff, premium product clarity, and no filler.",
      "Explicitly include synchronized voice, lip movement, sound design, ambience, and music when relevant.",
      "If reference media is provided, preserve the subject identity, product/app UI, brand look, composition cues, and visual style from the references.",
      "Do not write markdown. Do not explain. Output only the final prompt text.",
      "",
      `Duration: ${params.durationSecs} seconds.`,
      `Aspect ratio: ${params.aspectRatio}.`,
      params.motion ? `Requested camera motion: ${params.motion}.` : null,
      params.style ? `Requested style: ${params.style}.` : null,
      params.audio ? "Audio: include natural synchronized speech/voiceover and realistic scene sounds." : "Audio: no generated speech required unless visually implied.",
      "",
      "User idea:",
      params.prompt,
      "",
      "Begin the final prompt with: Use this prompt for Gemini Veo 3 to generate a realistic video with synchronized voice and sound, seamless pacing, no gaps, and premium cinematic quality:",
    ].filter(Boolean).join("\n"),
  }];

  const references = (params.references ?? []).map(dataUrlToInlineData).filter((item): item is NonNullable<typeof item> => Boolean(item));
  references.slice(0, 4).forEach((reference, index) => {
    parts.push({ text: `Reference visual ${index + 1} for product/person/style/UI continuity:` });
    parts.push({ inlineData: reference });
  });

  const data = await geminiRequest(PROMPT_ENHANCER_MODEL, {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  const enhanced = extractGeminiText(data);
  return enhanced || params.prompt;
}

async function safeJson(res: Response): Promise<{ ok: true; data: unknown } | { ok: false; text: string }> {
  const text = await res.text();
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, text: text.slice(0, 300) };
  }
}

async function gcsUriToDataUrl(uri: string): Promise<string | null> {
  const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, bucket, object] = match;
  const downloadUrl = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`;
  try {
    const token = createStorageJWT();
    const gcsRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!gcsRes.ok) return null;
    const buffer = await gcsRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:video/mp4;base64,${base64}`;
  } catch {
    return null;
  }
}

function extractVideo(response: PollResponse["response"]): { b64?: string; mime?: string; uri?: string } | null {
  if (!response) return null;
  const v = response.videos?.[0];
  if (v?.bytesBase64Encoded) return { b64: v.bytesBase64Encoded, mime: v.mimeType };
  if (v?.uri) return { uri: v.uri };
  const p = response.predictions?.[0];
  if (p?.bytesBase64Encoded) return { b64: p.bytesBase64Encoded, mime: p.mimeType };
  if (p?.gcsUri) return { uri: p.gcsUri };
  const s = response.generatedSamples?.[0]?.video;
  if (s?.bytesBase64Encoded) return { b64: s.bytesBase64Encoded, mime: s.mimeType };
  if (s?.uri) return { uri: s.uri };
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, duration, aspectRatio, motion, style, referenceImage, referenceImages, referenceVideoFrames, audio = true, allowSilentFallback = false } = await req.json() as {
      prompt: string;
      duration?: string;
      aspectRatio?: string;
      motion?: string;
      style?: string;
      referenceImage?: string;
      referenceImages?: string[];
      referenceVideoFrames?: string[];
      audio?: boolean;
      allowSilentFallback?: boolean;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const project = process.env.GOOGLE_PROJECT_ID;
    const location = process.env.GOOGLE_LOCATION ?? "us-central1";
    if (!project) {
      return NextResponse.json({ error: "GOOGLE_PROJECT_ID not configured" }, { status: 500 });
    }

    // Veo duration support is discrete, not continuous. Some deployments reject
    // values like 5s with: "supported durations are [8,4,6]". Accept any caller
    // duration and round up to the closest supported duration so the timeline can
    // use flexible scene lengths without breaking generation.
    const requestedDurationSecs = Number.parseFloat(duration ?? "8");
    const durationSecs = normalizeVeoDurationSeconds(duration);
    const ratio = aspectRatio ?? "9:16";
    const references = [
      referenceImage,
      ...(Array.isArray(referenceImages) ? referenceImages : []),
      ...(Array.isArray(referenceVideoFrames) ? referenceVideoFrames : []),
    ].filter((item): item is string => typeof item === "string" && item.length > 0);

    let veoPrompt = prompt;
    let promptEnhanced = false;
    let promptEnhancementError: string | null = null;
    try {
      veoPrompt = await enhancePromptForVeo({
        prompt,
        durationSecs,
        aspectRatio: ratio,
        motion,
        style,
        audio,
        references,
      });
      promptEnhanced = veoPrompt.trim() !== prompt.trim();
    } catch (error) {
      promptEnhancementError = error instanceof Error ? error.message : "Prompt enhancement failed";
    }

    const fullPrompt = [
      veoPrompt,
      motion && `Camera motion: ${motion}`,
      style && `Visual style: ${style}`,
      audio && "Include synchronized native audio with realistic ambience, sound effects, and any natural speech implied by the scene",
      "Cinematic quality, professional commercial production",
    ].filter(Boolean).join(". ");

    const instance: Record<string, unknown> = { prompt: fullPrompt };
    const veoReference = references.map(dataUrlToInlineData).find(Boolean);
    if (veoReference) {
      const reference = veoReference;
      if (reference) {
        instance.image = { bytesBase64Encoded: reference.data, mimeType: reference.mimeType };
      }
    }

    const baseParameters = { aspectRatio: ratio, durationSeconds: durationSecs };

    // Prefer the best available Gemini/Veo video family first, then gracefully
    // fall back for projects where newer preview model IDs are not enabled.
    // Keep audio-generating requests on Veo 3+ because Veo 2 may return valid
    // but silent video, which is confusing when the user asked for voice/sound.
    const models = audio ? VEO_MODELS_WITH_AUDIO : VEO_MODELS_SILENT_OK;
    let operationName: string | null = null;
    let usedModel = "";
    let lastError = "";
    let audioMode: "explicit" | "native" | "off" | "silent-fallback" = audio ? "explicit" : "off";

    for (const model of models) {
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predictLongRunning`;
      const attempts = audio
        ? [
            { mode: "explicit" as const, body: { instances: [instance], parameters: { ...baseParameters, generateAudio: true } } },
            // Some Vertex/Veo deployments expose Veo 3 audio natively and reject
            // an explicit generateAudio flag. Keep the audio-focused prompt and
            // retry Veo 3 without that parameter before giving up.
            { mode: "native" as const, body: { instances: [instance], parameters: baseParameters } },
          ]
        : [
            { mode: "off" as const, body: { instances: [instance], parameters: { ...baseParameters, generateAudio: false } } },
          ];

      for (const attempt of attempts) {
        const token = createVertexJWT();

        const initRes = await fetch(url, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(attempt.body),
          cache: "no-store",
        });

        const parsed = await safeJson(initRes);
        if (!parsed.ok) {
          lastError = `${model} returned non-JSON (status ${initRes.status}): ${parsed.text}`;
          continue;
        }

        const body = parsed.data as { name?: string; error?: { message?: string; code?: number } };

        if (body.error) {
          const code = body.error.code ?? initRes.status;
          if (code === 404 || code === 400) { lastError = `${model}: ${body.error.message}`; continue; }
          throw new Error(`${model}: ${body.error.message ?? `API error ${code}`}`);
        }

        if (!initRes.ok) {
          lastError = `${model}: HTTP ${initRes.status}`;
          if (initRes.status === 404 || initRes.status === 400) continue;
          throw new Error(lastError);
        }

        if (body.name) {
          operationName = body.name;
          usedModel = model;
          audioMode = attempt.mode;
          break;
        }
        lastError = `${model}: no operation name in response`;
      }

      if (operationName) break;
    }

    if (!operationName && audio && allowSilentFallback) {
      const fallbackModel = "veo-2.0-generate-001";
      const fallbackUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${fallbackModel}:predictLongRunning`;
      const token = createVertexJWT();
      const fallbackBody = {
        instances: [instance],
        parameters: { aspectRatio: ratio, durationSeconds: durationSecs },
      };
      const fallbackRes = await fetch(fallbackUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody),
        cache: "no-store",
      });
      const parsed = await safeJson(fallbackRes);
      if (parsed.ok) {
        const body = parsed.data as { name?: string; error?: { message?: string; code?: number } };
        if (fallbackRes.ok && body.name) {
          operationName = body.name;
          usedModel = fallbackModel;
          audioMode = "silent-fallback";
        } else if (body.error?.message) {
          lastError = `${fallbackModel}: ${body.error.message}`;
        }
      } else {
        lastError = `${fallbackModel} returned non-JSON (status ${fallbackRes.status}): ${parsed.text}`;
      }
    }

    if (!operationName) {
      throw new Error(`No Veo model available. ${lastError}`);
    }

    // Veo on Vertex AI uses fetchPredictOperation — NOT the generic /operations/ endpoint
    const fetchOpUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${usedModel}:fetchPredictOperation`;
    const deadline = Date.now() + 300_000;
    let videoUrl: string | null = null;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 5000));
      const freshToken = createVertexJWT();
      const pollRes = await fetch(fetchOpUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${freshToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ operationName }),
        cache: "no-store",
      });

      const pollParsed = await safeJson(pollRes);
      if (!pollParsed.ok) throw new Error(`Poll returned non-JSON: ${pollParsed.text}`);

      const poll = pollParsed.data as PollResponse;
      if (poll.error) throw new Error(poll.error.message ?? "Veo operation failed");

      if (poll.done) {
        const extracted = extractVideo(poll.response);
        if (extracted?.b64) {
          videoUrl = `data:${extracted.mime ?? "video/mp4"};base64,${extracted.b64}`;
        } else if (extracted?.uri) {
          videoUrl = await gcsUriToDataUrl(extracted.uri);
          if (!videoUrl) throw new Error("Video stored in GCS but download failed — ensure the service account has Storage Object Viewer role.");
        }
        break;
      }
    }

    if (!videoUrl) {
      return NextResponse.json({ error: "Video generation timed out after 5 minutes" }, { status: 504 });
    }

    return NextResponse.json({
      videoUrl,
      url: videoUrl,
      usedModel,
      audioMode,
      audioRequested: audio,
      audioGenerated: audio && usedModel.startsWith("veo-3") && audioMode !== "silent-fallback",
      requestedDurationSeconds: Number.isFinite(requestedDurationSecs) ? requestedDurationSecs : null,
      generatedDurationSeconds: durationSecs,
      promptEnhanced,
      enhancedPrompt: veoPrompt,
      promptEnhancementError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Video generation failed";
    console.error("generate-video error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
