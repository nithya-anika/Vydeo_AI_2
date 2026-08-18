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
  downloadUrl?: string;
  renderId?: string;
  bucketName?: string;
  filename: string;
  engine: "cloud" | "local";
  outputPath?: string;
}

// ── Engine detection ──────────────────────────────────────────────────────────
export function getEngineType(): "cloud" | "local" {
  const hasCloudStorage = !!(process.env.GCS_BUCKET || process.env.S3_BUCKET_NAME);
  const hasRemotionLambda = !!(process.env.REMOTION_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID);
  return (hasCloudStorage && hasRemotionLambda) ? "cloud" : "local";
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

import { renderMediaOnLambda } from "@remotion/lambda/client";

async function renderCloud(params: RenderParams): Promise<RenderResult> {
  const region = (process.env.REMOTION_AWS_REGION || process.env.AWS_REGION || "eu-north-1") as any;
  const functionName = process.env.REMOTION_APP_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_APP_SERVE_URL;

  if (!functionName || !serveUrl) {
    throw new Error(
      "Remotion Lambda requires REMOTION_APP_FUNCTION_NAME and REMOTION_APP_SERVE_URL. Please run 'npx remotion lambda setup' and 'npx remotion lambda sites create' to generate these."
    );
  }

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

  // Pre-process scenes to ensure URLs are public HTTP/HTTPS for Lambda
  const scenes = params.scenes.map((scene) => {
    let url = "";
    const rawUrl = scene.clipSrc ?? "";
    const resolvedUrl = convertGsToPublicUrl(rawUrl);

    if (resolvedUrl && (resolvedUrl.startsWith("http://") || resolvedUrl.startsWith("https://"))) {
      url = resolvedUrl;
    } else {
      throw new Error(`AWS Lambda requires public HTTP/HTTPS URLs. Scene "${scene.id}" has invalid or missing clipSrc.`);
    }

    return {
      ...scene,
      clipSrc: url,
    };
  });

  const inputProps = {
    scenes,
    audio: params.audio ? {
      ...params.audio,
      src: convertGsToPublicUrl(params.audio.src),
    } : undefined,
    width,
    height,
    totalDuration: params.totalDuration,
  };

  console.log("[Remotion Lambda] Dispatching render request...");

  // Calculate total frames (assuming 30fps)
  const durationInFrames = Math.max(30, Math.floor((params.totalDuration ?? 15) * 30));

  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: "Main", // The name of the composition in your Remotion project
    inputProps,
    codec: "h264",
    imageFormat: "jpeg",
    maxRetries: 3,
    framesPerLambda: 150, // Less aggressive parallelism to avoid AWS limits
    privacy: "public",
  });

  console.log(`[Remotion Lambda] Render accepted asynchronously. ID: ${renderId} in bucket ${bucketName}`);

  // RETURN IMMEDIATELY — Do not poll here! Polling will be done by the client (TopBar.tsx) to prevent Vercel 504 timeouts.
  return {
    renderId,
    bucketName,
    filename: params.outputFilename,
    engine: "cloud",
  };
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
