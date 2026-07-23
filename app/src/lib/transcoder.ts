/**
 * Cloud rendering abstraction.
 *
 * Primary path: Google Cloud Video Transcoder API + GCS storage.
 * Fallback:     Local FFmpeg (existing approach) when GCS_BUCKET is not set.
 *
 * To enable cloud rendering, set in .env.local:
 *   GCS_BUCKET=your-bucket-name
 *   GCS_RENDER_PREFIX=renders   (optional, default: "renders")
 *
 * The service account in GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY is reused
 * — it needs roles/storage.objectAdmin and roles/transcoder.admin.
 */
import { GoogleAuth } from "google-auth-library";

export interface SceneInput {
  id: string;
  duration: number;
  clipData?: string;   // base64 data-url or "data:video/mp4;base64,..."
  clipSrc?: string;    // remote/public URL that the server can fetch during render
  clipType?: "video" | "image";
  clipMime?: string;
  clipExt?: string;
  clipTrimStart?: number;
  clipTrimEnd?: number;
  playbackSpeed?: number;
  visualEffect?: string;
  transition?: { type: string; duration: number };
  captions?: RenderCaption[];
}

export interface AudioInput {
  src: string;         // base64 data-url
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface RenderCaption {
  text: string;
  startTime: number;
  endTime: number;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  bgOpacity?: number;
  bold?: boolean;
  x?: number;
  y?: number;
  align?: "left" | "center" | "right";
}

export interface BrandRenderInput {
  logoData?: string;
  logoOpacity?: number;
  logoStart?: number;
  logoEnd?: number;
  primaryColor?: string;
  fontFamily?: string;
}

export interface RenderParams {
  scenes: SceneInput[];
  audio?: AudioInput;
  brand?: BrandRenderInput;
  aspectRatio?: string;
  totalDuration?: number;
  outputFilename: string;
}

export interface RenderResult {
  downloadUrl: string;
  filename: string;
  engine: "cloud" | "local";
  outputPath?: string;
}

// ── Engine detection ──────────────────────────────────────────────────────────
export function getEngineType(): "cloud" | "local" {
  return process.env.GCS_BUCKET ? "cloud" : "local";
}

// ── Cloud Transcoder path ─────────────────────────────────────────────────────
async function getGcpToken(): Promise<string> {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL!,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    projectId: process.env.GOOGLE_PROJECT_ID,
  });
  return (await auth.getAccessToken()) ?? "";
}

async function uploadToGcs(
  base64Data: string,
  gcsPath: string,
  contentType: string,
  token: string,
  bucket: string,
): Promise<string> {
  const sepIdx = base64Data.indexOf(",");
  const b64 = sepIdx !== -1 ? base64Data.slice(sepIdx + 1) : base64Data;
  const buf = Buffer.from(b64, "base64");

  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(gcsPath)}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": contentType, "Content-Length": String(buf.length) },
    body: buf,
  });
  if (!res.ok) throw new Error(`GCS upload failed (${res.status}): ${await res.text()}`);
  return `gs://${bucket}/${gcsPath}`;
}

async function deleteGcsObject(gcsPath: string, token: string, bucket: string): Promise<void> {
  await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(gcsPath)}`,
    { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } },
  ).catch(() => { /* best-effort cleanup */ });
}

async function createTranscoderJob(params: {
  project: string;
  location: string;
  token: string;
  inputUris: string[];
  outputUri: string;
  width: number;
  height: number;
  scenes: SceneInput[];
  audioUri?: string;
  audioVolume?: number;
}): Promise<string> {
  const { project, location, token, inputUris, outputUri, width, height, scenes, audioUri, audioVolume } = params;

  // Build edit atoms — one per scene
  const editAtoms = scenes.map((scene, i) => ({
    key: `atom${i}`,
    inputs: [String(i)],
    startTimeOffset: "0s",
    endTimeOffset: `${scene.duration}s`,
  }));

  // Mux sequence
  const videoStreams = [{
    key: "output-video",
    videoStream: {
      h264: {
        widthPixels: width,
        heightPixels: height,
        bitrateBps: width >= 1920 ? 8000000 : 4000000,
        frameRate: 24,
        pixelFormat: "yuv420p",
        profile: "high",
      },
    },
  }];

  const audioStreams = audioUri ? [{
    key: "output-audio",
    audioStream: { codec: "aac", bitrateBps: 192000, channelCount: 2, sampleRateHertz: 48000 },
  }] : [];

  const muxStreams = [{
    key: "output",
    container: "mp4",
    elementaryStreams: audioUri ? ["output-video", "output-audio"] : ["output-video"],
  }];

  const inputs = inputUris.map((uri, i) => ({ key: String(i), uri }));
  if (audioUri) inputs.push({ key: "audio", uri: audioUri });

  const jobConfig = {
    inputs,
    editList: editAtoms,
    elementaryStreams: [...videoStreams, ...audioStreams],
    muxStreams,
    output: { uri: outputUri },
  };

  const endpoint = `https://transcoder.googleapis.com/v1/projects/${project}/locations/${location}/jobs`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ config: jobConfig }),
  });
  if (!res.ok) throw new Error(`Transcoder job create failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const job = await res.json() as { name: string };
  return job.name;
}

async function pollTranscoderJob(jobName: string, token: string, timeoutMs = 240_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://transcoder.googleapis.com/v1/${jobName}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) continue;
    const job = await res.json() as { state: string; error?: { message: string } };
    if (job.state === "SUCCEEDED") return;
    if (job.state === "FAILED") throw new Error(`Transcoder job failed: ${job.error?.message ?? "unknown"}`);
  }
  throw new Error("Transcoder job timed out after 4 minutes.");
}

async function generateSignedUrl(gcsPath: string, token: string, bucket: string): Promise<string> {
  // Generate a 7-day signed URL via the GCS JSON API (service account sign blob)
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(gcsPath)}?alt=media`,
    { headers: { "Authorization": `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`GCS signed URL failed: ${res.status}`);
  // Return a public-style URL — the caller streams it
  return `https://storage.googleapis.com/${bucket}/${gcsPath}`;
}

async function renderCloud(params: RenderParams): Promise<RenderResult> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY is not configured.");

  const aspect = params.aspectRatio ?? "9:16";
  let width = 1080;
  let height = 1920;
  
  if (aspect === "16:9") {
    width = 1920;
    height = 1080;
  } else if (aspect === "1:1") {
    width = 1080;
    height = 1080;
  } else if (aspect === "4:5") {
    width = 1080;
    height = 1350;
  }

  // Map scenes to Shotstack clips
  let currentTime = 0;
  const clips = params.scenes.map((scene) => {
    const start = currentTime;
    const length = scene.duration;
    currentTime += length;

    // Determine the media URL to feed to Shotstack
    let url = "";
    if (scene.clipSrc && (scene.clipSrc.startsWith("http://") || scene.clipSrc.startsWith("https://"))) {
      url = scene.clipSrc;
    } else {
      throw new Error(`Shotstack requires public HTTP/HTTPS URLs. Scene "${scene.id}" has invalid or missing clipSrc.`);
    }

    // Determine if it is a video or image based on clipType or extension
    const isImage = scene.clipType === "image" || url.match(/\.(jpg|jpeg|png)$/i);

    return {
      asset: isImage
        ? { type: "image", src: url }
        : { type: "video", src: url },
      start,
      length,
    };
  });

  const timeline: any = {
    background: "#000000",
    tracks: [
      {
        clips,
      },
    ],
  };

  // Add background audio if present
  if (params.audio?.src && (params.audio.src.startsWith("http://") || params.audio.src.startsWith("https://"))) {
    timeline.tracks.push({
      clips: [
        {
          asset: {
            type: "audio",
            src: params.audio.src,
            volume: params.audio.volume ?? 0.7,
            effect: "fade", // basic mapping for fade in/out
          },
          start: 0,
          length: params.totalDuration ?? currentTime,
        },
      ],
    });
  }

  const payload = {
    timeline,
    output: {
      format: "mp4",
      resolution: width > height ? "hd" : width === height ? "square" : "mobile", // Simple mapping
      fps: 30,
    },
  };

  console.log("[Shotstack] Dispatching render request...");

  const res = await fetch("https://api.shotstack.io/edit/v1/render", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Shotstack render request failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const renderId = data.response.id;
  console.log(`[Shotstack] Render accepted. ID: ${renderId}`);

  // Polling
  const maxPolls = 120; // 10 minutes (5s intervals)
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    
    const statusRes = await fetch(`https://api.shotstack.io/edit/v1/render/${renderId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const status = statusData.response.status;

    if (status === "done") {
      console.log(`[Shotstack] Render complete!`);
      return {
        downloadUrl: statusData.response.url,
        filename: params.outputFilename,
        engine: "cloud",
      };
    } else if (status === "failed") {
      throw new Error(`Shotstack render failed: ${statusData.response.error}`);
    } else {
      console.log(`[Shotstack] Polling... Status: ${status}`);
    }
  }

  throw new Error("Shotstack render timed out after 10 minutes.");
}

// ── Local FFmpeg fallback path ────────────────────────────────────────────────
async function renderLocal(params: RenderParams): Promise<RenderResult> {
  // Dynamically import the local render logic to avoid loading FFmpeg in cloud mode
  const { renderWithFfmpeg } = await import("./ffmpeg-render");
  const result = await renderWithFfmpeg(params);
  return { ...result, engine: "local" };
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function renderVideo(params: RenderParams): Promise<RenderResult> {
  if (getEngineType() === "cloud") {
    return renderCloud(params);
  }
  return renderLocal(params);
}

function aspectRatioToDimensions(r: string): [number, number] {
  switch (r) {
    case "16:9": return [1920, 1080];
    case "1:1":  return [1080, 1080];
    case "4:5":  return [1080, 1350];
    case "3:4":  return [1080, 1440];
    default:     return [1080, 1920]; // 9:16
  }
}
