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
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

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
  colorGrade?: string | null;
  colorAdjustments?: any;
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
  // We explicitly return "local" here to guarantee the application 
  // bypasses JSON2Video/Shotstack and natively uses the built-in FFmpeg renderer
  // running on the AWS EC2 instance.
  return "local";
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

function convertGsToPublicUrl(gsUrl: string): string {
  if (gsUrl.startsWith("gs://")) {
    const match = gsUrl.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (match) {
      const bucket = match[1];
      const gcsPath = match[2];
      return `https://storage.googleapis.com/${bucket}/${gcsPath}`;
    }
  }
  return gsUrl;
}

function toJson2VideoTransition(type: string): string {
  switch (type?.toLowerCase()) {
    case "fade":
    case "cinematic-fade":
    case "dissolve":
      return "fade";
    case "wipe-left":
      return "wipeleft";
    case "wipe-right":
      return "wiperight";
    case "slide-left":
      return "slideleft";
    case "slide-right":
      return "slideright";
    default:
      return "fade";
  }
}

function toJson2VideoCorrection(adjustments?: any, effect?: string) {
  const correction: any = {};
  
  if (effect) {
    const e = effect.toLowerCase();
    if (e.includes("warm")) {
      correction.saturation = 1.1;
    } else if (e.includes("cool") || e.includes("blue") || e.includes("cold")) {
      correction.saturation = 0.9;
    } else if (e.includes("vibrant") || e.includes("rich")) {
      correction.saturation = 1.3;
      correction.contrast = 1.1;
    } else if (e.includes("moody") || e.includes("dark")) {
      correction.brightness = 0.8;
      correction.contrast = 1.1;
    } else if (e.includes("bright") || e.includes("light")) {
      correction.brightness = 1.2;
    } else if (e.includes("greyscale") || e.includes("grey") || e.includes("mono")) {
      correction.saturation = 0.0;
    }
  }

  if (adjustments) {
    if (adjustments.brightness !== undefined) {
      correction.brightness = (correction.brightness ?? 1) + (adjustments.brightness / 100);
    }
    if (adjustments.contrast !== undefined) {
      correction.contrast = (correction.contrast ?? 1) + (adjustments.contrast / 100);
    }
    if (adjustments.saturation !== undefined) {
      correction.saturation = (correction.saturation ?? 1) + (adjustments.saturation / 100);
    }
  }

  return Object.keys(correction).length > 0 ? correction : undefined;
}

async function renderCloud(params: RenderParams): Promise<RenderResult> {
  const apiKey = process.env.JSON2VIDEO_API_KEY;
  if (!apiKey) throw new Error("JSON2VIDEO_API_KEY is not configured.");

  const aspect = params.aspectRatio ?? "9:16";
  let resolution = "full-hd";
  
  if (aspect === "16:9") {
    resolution = "full-hd";
  } else if (aspect === "1:1" || aspect === "4:5") {
    resolution = "hd";
  }

  // Map scenes to JSON2Video sequential scenes
  const scenes = params.scenes.map((scene, index) => {
    const duration = scene.duration;
    let url = "";
    const rawUrl = scene.clipSrc ?? "";
    const resolvedUrl = convertGsToPublicUrl(rawUrl);

    if (resolvedUrl && (resolvedUrl.startsWith("http://") || resolvedUrl.startsWith("https://"))) {
      url = resolvedUrl;
    } else {
      throw new Error(`JSON2Video requires public HTTP/HTTPS URLs. Scene "${scene.id}" has invalid or missing clipSrc.`);
    }

    const isImage = scene.clipType === "image" || url.match(/\.(jpg|jpeg|png)$/i);

    const elementObj: any = {
      type: isImage ? "image" : "video",
      src: url,
      duration: duration,
    };

    const correction = toJson2VideoCorrection(scene.colorAdjustments, scene.visualEffect || scene.colorGrade || undefined);
    if (correction) {
      elementObj.correction = correction;
    }

    const sceneObj: any = {
      elements: [elementObj],
    };

    // Apply scene transition if set (defines transition FROM previous scene)
    if (index > 0 && scene.transition && scene.transition.type && scene.transition.type !== "cut") {
      const type = toJson2VideoTransition(scene.transition.type);
      sceneObj.transition = {
        type: "xfade",
        style: type,
        duration: scene.transition.duration ?? 0.8,
      };
    }

    return sceneObj;
  });

  const elements: any[] = [];

  // Add background audio if present
  if (params.audio?.src) {
    const audioSrc = convertGsToPublicUrl(params.audio.src);
    if (audioSrc.startsWith("http://") || audioSrc.startsWith("https://")) {
      elements.push({
        type: "audio",
        src: audioSrc,
        volume: params.audio.volume ?? 0.7,
        loop: true,
      });
    }
  }

  const payload = {
    resolution,
    quality: "high",
    elements,
    scenes,
  };

  console.log("[JSON2Video] Dispatching render request...");

  const res = await fetch("https://api.json2video.com/v2/movies", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`JSON2Video render request failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const projectId = data.project;
  if (!projectId) {
    throw new Error("JSON2Video response did not contain a project ID.");
  }
  console.log(`[JSON2Video] Render accepted. Project ID: ${projectId}`);

  // Polling
  const maxPolls = 120; // 10 minutes (5s intervals)
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    
    const statusRes = await fetch(`https://api.json2video.com/v2/movies?project=${projectId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    const movie = statusData.movie;
    const status = movie?.status;

    if (status === "done") {
      console.log(`[JSON2Video] Render complete!`);
      return {
        downloadUrl: movie.url,
        filename: params.outputFilename,
        engine: "cloud",
      };
    } else if (status === "error" || status === "failed") {
      throw new Error(`JSON2Video render failed: ${movie?.message || "Unknown error"}`);
    } else {
      console.log(`[JSON2Video] Polling... Status: ${status}`);
    }
  }

  throw new Error("JSON2Video render timed out after 10 minutes.");
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

// ── Cleanup ───────────────────────────────────────────────────────────────────
export async function cleanupCloudMedia(urls: string[]) {
  const storjEndpoint = process.env.STORJ_ENDPOINT;
  const storjBucket = process.env.STORJ_BUCKET || "vydeoai";
  const storjAccessKey = process.env.STORJ_ACCESS_KEY;
  const storjSecretKey = process.env.STORJ_SECRET_KEY;

  for (const url of urls) {
    if (!url) continue;

    try {
      // Delete from Storj S3
      if (storjEndpoint && storjAccessKey && storjSecretKey) {
        const prefix = `${storjEndpoint}/${storjBucket}/`;
        if (url.startsWith(prefix)) {
          const key = url.replace(prefix, "");
          const s3Client = new S3Client({
            region: "us-east-1",
            endpoint: storjEndpoint,
            credentials: { accessKeyId: storjAccessKey, secretAccessKey: storjSecretKey },
            forcePathStyle: true,
          });
          await s3Client.send(new DeleteObjectCommand({ Bucket: storjBucket, Key: key }));
          console.log(`[Cleanup] Deleted from Storj: ${key}`);
        }
      }
    } catch (err) {
      console.error(`[Cleanup] Failed to delete ${url}:`, err);
    }
  }
}
