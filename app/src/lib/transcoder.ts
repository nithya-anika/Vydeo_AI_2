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
  const hasCloudStorage = !!(process.env.GCS_BUCKET || process.env.SUPABASE_URL);
  const hasShotstack = !!process.env.SHOTSTACK_API_KEY;
  return (hasCloudStorage && hasShotstack) ? "cloud" : "local";
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

function toShotstackTransition(type: string): string {
  switch (type?.toLowerCase()) {
    case "fade":
    case "cinematic-fade":
      return "fade";
    case "wipe-left":
      return "wipeLeft";
    case "wipe-right":
      return "wipeRight";
    case "slide-left":
      return "slideLeft";
    case "slide-right":
      return "slideRight";
    case "zoom-in":
    case "zoom-out":
    case "zoom":
      return "zoom";
    default:
      return "fade";
  }
}

function toShotstackEffect(effect: string): string | undefined {
  const e = effect?.toLowerCase();
  if (!e) return undefined;
  if (e.includes("warm")) return "warm";
  if (e.includes("cool") || e.includes("blue") || e.includes("cold")) return "cold";
  if (e.includes("vintage")) return "vintage";
  if (e.includes("vibrant") || e.includes("rich")) return "vibrant";
  if (e.includes("moody") || e.includes("dark")) return "dark";
  if (e.includes("bright") || e.includes("light")) return "light";
  if (e.includes("greyscale") || e.includes("grey") || e.includes("mono")) return "greyscale";
  return undefined;
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

  // Map scenes to Shotstack clips with proper transition overlapping
  let currentTime = 0;
  const clips = params.scenes.map((scene, index) => {
    const duration = scene.duration;

    // Check if there is a transition from the previous clip
    let transitionDuration = 0;
    if (index > 0) {
      const prevScene = params.scenes[index - 1];
      if (prevScene.transition && prevScene.transition.type && prevScene.transition.type !== "cut") {
        transitionDuration = prevScene.transition.duration ?? 0.5;
      }
    }

    // Overlap the start time by the transition duration to create a smooth crossfade
    const start = Math.max(0, currentTime - transitionDuration);
    const length = duration;

    // Advance time accumulated, accounting for the crossfade overlap
    currentTime = start + length;

    // Determine the media URL to feed to Shotstack
    let url = "";
    const rawUrl = scene.clipSrc ?? "";
    const resolvedUrl = convertGsToPublicUrl(rawUrl);

    if (resolvedUrl && (resolvedUrl.startsWith("http://") || resolvedUrl.startsWith("https://"))) {
      url = resolvedUrl;
    } else {
      throw new Error(`Shotstack requires public HTTP/HTTPS URLs. Scene "${scene.id}" has invalid or missing clipSrc.`);
    }

    // Determine if it is a video or image based on clipType or extension
    const isImage = scene.clipType === "image" || url.match(/\.(jpg|jpeg|png)$/i);

    const clipObj: any = {
      asset: isImage
        ? { type: "image", src: url }
        : { type: "video", src: url },
      start,
      length,
    };

    // Map visual effect (color grading) to Shotstack clips
    if (scene.visualEffect) {
      const effect = toShotstackEffect(scene.visualEffect);
      if (effect) {
        clipObj.effect = effect;
      }
    } else if (scene.colorGrade) {
      const effect = toShotstackEffect(scene.colorGrade);
      if (effect) {
        clipObj.effect = effect;
      }
    }

    // Map custom color adjustments (Brightness, Contrast, Saturation) to Shotstack's strictly typed filter strings.
    // Shotstack V1 API only accepts a single predefined string for filters, not custom numeric arrays.
    if (scene.colorAdjustments) {
      if (scene.colorAdjustments.brightness > 20) {
        clipObj.filter = "lighten";
      } else if (scene.colorAdjustments.brightness < -20) {
        clipObj.filter = "darken";
      } else if (scene.colorAdjustments.contrast > 20) {
        clipObj.filter = "contrast";
      } else if (scene.colorAdjustments.saturation > 20) {
        clipObj.filter = "boost";
      } else if (scene.colorAdjustments.saturation < -50) {
        clipObj.filter = "greyscale";
      }
    }

    // Map transitions to Shotstack clips
    if (scene.transition && scene.transition.type && scene.transition.type !== "cut") {
      const type = toShotstackTransition(scene.transition.type);
      clipObj.transition = {
        in: type,
        out: type,
      };
    }

    return clipObj;
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
  if (params.audio?.src) {
    const audioSrc = convertGsToPublicUrl(params.audio.src);
    if (audioSrc.startsWith("http://") || audioSrc.startsWith("https://")) {
      timeline.tracks.push({
        clips: [
          {
            asset: {
              type: "audio",
              src: audioSrc,
              volume: params.audio.volume ?? 0.7,
              effect: "fadeInFadeOut", // basic mapping for fade in/out
            },
            start: 0,
            length: params.totalDuration ?? currentTime,
          },
        ],
      });
    }
  }

  const payload = {
    timeline,
    output: {
      format: "mp4",
      resolution: "1080", // Unified 1080p HD rendering tier
      aspectRatio: aspect, // Direct, native aspect ratio setting (9:16, 1:1, 16:9, etc.)
      quality: "high", // Set to "high" for maximum, ultra-sharp bitrate matching the original video clarity!
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

// ── Cleanup ───────────────────────────────────────────────────────────────────
export async function cleanupCloudMedia(urls: string[]) {
  const storjEndpoint = process.env.STORJ_ENDPOINT;
  const storjBucket = process.env.STORJ_BUCKET || "vydeoai";
  const storjAccessKey = process.env.STORJ_ACCESS_KEY;
  const storjSecretKey = process.env.STORJ_SECRET_KEY;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseBucket = process.env.SUPABASE_BUCKET || "vydeoai2";

  for (const url of urls) {
    if (!url) continue;

    try {
      // 1. Delete from Storj S3
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
          continue;
        }
      }

      // 2. Delete from Supabase
      if (supabaseUrl && supabaseKey) {
        const cleanUrl = supabaseUrl.replace(/\/$/, "");
        const prefix = `${cleanUrl}/storage/v1/object/public/${supabaseBucket}/`;
        if (url.startsWith(prefix)) {
          const key = url.replace(prefix, "");
          const deleteUrl = `${cleanUrl}/storage/v1/object/${supabaseBucket}/${encodeURIComponent(key)}`;
          const delRes = await fetch(deleteUrl, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${supabaseKey}` },
          });
          if (delRes.ok) {
            console.log(`[Cleanup] Deleted from Supabase: ${key}`);
          } else {
            console.warn(`[Cleanup] Supabase delete failed for ${key}: ${delRes.status}`);
          }
        }
      }
    } catch (err) {
      console.error(`[Cleanup] Failed to delete ${url}:`, err);
    }
  }
}
