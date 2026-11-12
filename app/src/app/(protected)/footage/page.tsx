"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAssistantStore } from "@/store/assistantStore";
import { motion, AnimatePresence } from "framer-motion";
import { TEMPLATES as TEMPLATE_REGISTRY } from "@/lib/templates/registry";
import type { ReferenceMedia, ReferenceStyleProfile } from "@/types/references";
import {
  Upload, Film, X, Play, Sparkles, ArrowRight,
  Scissors, Shuffle, Zap, Music, Clock, LayoutGrid,
  ChevronDown, AlertCircle, HardDrive,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useEditorStore, type AspectRatio } from "@/store/editorStore";
import { inferRequestedColorAdjustments, inferRequestedColorGrade, inferRequestedTransition } from "@/lib/footagePromptControls";

import { buildScenesFromPlan, type UploadedClip, type EditPlan } from "@/lib/footagePlan";
import { extractAudioTrackAsWav } from "@/lib/audioExtractor";
import { calculateSceneKeyframeTimestamps } from "@/lib/videoKeyframes";

// ── Prompt suggestions ────────────────────────────────────────────────────────

const PROMPT_EXAMPLES = [
  "Remove silent parts, retakes, and recording cues, keeping only essential dialogue and actions",
  "Cut to the best moments and add smooth transitions",
  "Create a cinematic highlight reel with slow motion",
  "Arrange clips chronologically with text overlays",
  "Make a fast-paced energetic edit with beat syncing",
  "Create a travel montage with warm color grading",
  "Extract the key moments and add captions",
  "Create a short 30-second highlight reel",
  "Arrange by energy — slow start, intense middle, strong finish",
];

const ASPECT_OPTIONS = [
  { value: "9:16" as AspectRatio, label: "9:16", sub: "Reels / TikTok" },
  { value: "16:9" as AspectRatio, label: "16:9", sub: "YouTube" },
  { value: "1:1" as AspectRatio, label: "1:1", sub: "Feed" },
  { value: "4:5" as AspectRatio, label: "4:5", sub: "Portrait" },
];

const DURATION_OPTIONS = [
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: -1, label: "Use all footage" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(s: number) {
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function formatSize(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

async function getVideoMeta(
  file: File,
  src: string
): Promise<{ duration: number; width: number; height: number; thumbnail: string; frames: string[] }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    // Do NOT set crossOrigin on blob URLs — it prevents loadeddata from firing
    video.src = src;

    video.addEventListener("error", () => {
      resolve({ duration: 5, width: 1920, height: 1080, thumbnail: "", frames: [] });
    });

    video.addEventListener("loadeddata", async () => {
      const dur = video.duration || 5;
      const W = 240;
      const H = Math.round(W * (video.videoHeight || 9) / (video.videoWidth || 16));

      function captureAt(t: number): Promise<string> {
        return new Promise((res) => {
          let settled = false;
          const finish = (value: string) => {
            if (settled) return;
            settled = true;
            video.removeEventListener("seeked", handler);
            clearTimeout(timer);
            res(value);
          };
          function handler() {
            const cvs = document.createElement("canvas");
            cvs.width = W; cvs.height = H;
            cvs.getContext("2d")?.drawImage(video, 0, 0, W, H);
            finish(cvs.toDataURL("image/jpeg", 0.6));
          }
          // Some clips decode but never fire `seeked` — fall back to an empty
          // thumbnail after a timeout so addFiles can never hang forever.
          const timer = setTimeout(() => finish(""), 1500);
          video.addEventListener("seeked", handler);
          video.currentTime = t;
        });
      }

      // Extract adaptive, scene-aware keyframes based on duration
      const { timestamps } = calculateSceneKeyframeTimestamps(dur, 8);
      const frames: string[] = [];
      for (const t of timestamps) {
        try { frames.push(await captureAt(t)); } catch { /* skip */ }
      }

      resolve({
        duration: dur,
        width: video.videoWidth,
        height: video.videoHeight,
        thumbnail: frames[0] ?? "",
        frames,
      });
    });
  });
}

// ── Clip Thumbnail ────────────────────────────────────────────────────────────

function ClipCard({ clip, onRemove, index }: { clip: UploadedClip; onRemove: () => void; index: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.88, y: -4 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", flexShrink: 0,
        width: 160, borderRadius: "var(--r-lg)",
        overflow: "hidden", background: "#0f0f14",
        border: `1.5px solid ${hovered ? "var(--accent-border)" : "var(--border)"}`,
        cursor: "default",
        transition: "border-color 0.15s",
      }}
    >
      {/* Thumbnail */}
      <div style={{ width: "100%", paddingBottom: "56.25%", position: "relative", background: "#111118", overflow: "hidden" }}>
        {clip.thumbnail ? (
          <img
            src={clip.thumbnail}
            alt={clip.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Film size={24} color="var(--text-tertiary)" />
          </div>
        )}
        {/* Duration badge */}
        <div style={{
          position: "absolute", bottom: 6, right: 6,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
          borderRadius: "var(--r-sm)", padding: "2px 6px",
          fontSize: 10, fontWeight: 700, color: "#fff",
          fontFamily: "var(--font-mono)",
        }}>
          {formatDuration(clip.duration)}
        </div>
        {/* Scene index */}
        <div style={{
          position: "absolute", top: 6, left: 6,
          background: "rgba(99,102,241,0.85)", backdropFilter: "blur(6px)",
          borderRadius: "var(--r-sm)", padding: "2px 7px",
          fontSize: 10, fontWeight: 700, color: "#fff",
        }}>
          {index + 1}
        </div>
      </div>

      {/* Info row */}
      <div style={{ padding: "7px 8px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {clip.name}
        </div>
        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
          {clip.file ? formatSize(clip.file.size) : "Cloud Direct"}
          {clip.width ? ` · ${clip.width}×${clip.height}` : ""}
        </div>
      </div>

      {/* Remove button */}
      <AnimatePresence>
        {hovered && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={onRemove}
            style={{
              position: "absolute", top: 6, right: 6,
              width: 22, height: 22, borderRadius: "50%",
              background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={11} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FootageEditorSetup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assistantName = useAssistantStore(s => s.name);
  const urlTemplateId = searchParams.get("templateId");
  const activeTemplate = urlTemplateId ? (TEMPLATE_REGISTRY[Number(urlTemplateId)] || Object.values(TEMPLATE_REGISTRY).find(t => t.id === urlTemplateId)) : null;
  const { loadTimeline } = useEditorStore();

  const [clips, setClips] = useState<UploadedClip[]>([]);
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [transcribingCount, setTranscribingCount] = useState(0);
  const [aspectRatio, setAspectRatioLocal] = useState<AspectRatio>("9:16");
  const [qualityMode, setQualityMode] = useState<"standard" | "premium">("standard");
  const [references, setReferences] = useState<ReferenceMedia[]>([]);
  const [referenceProfile, setReferenceProfile] = useState<ReferenceStyleProfile | null>(null);

  // Sync template presets and references on mount
  useEffect(() => {
    if (activeTemplate) {
      let initialPrompt = activeTemplate.editorialPrompt;
      try {
        const rawCustom = sessionStorage.getItem("vydeoai_template_customization");
        if (rawCustom) {
          const parsed = JSON.parse(rawCustom);
          if (String(parsed.templateId) === String(activeTemplate.id) || Number(parsed.templateId) === Number(urlTemplateId)) {
            if (parsed.customPrompt) initialPrompt = parsed.customPrompt;
            if (Array.isArray(parsed.references)) setReferences(parsed.references);
            if (parsed.referenceProfile) setReferenceProfile(parsed.referenceProfile);
          }
        }
      } catch {}

      setPrompt(initialPrompt);
      if (activeTemplate.aspectRatio) {
        setAspectRatioLocal(activeTemplate.aspectRatio as AspectRatio);
      }
    }
  }, [activeTemplate, urlTemplateId]);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [ingesting, setIngesting] = useState<{ current: number; total: number; filename: string } | null>(null);

  // Suggestor state
  const [showSuggestor, setShowSuggestor] = useState(false);
  const [suggestorMessages, setSuggestorMessages] = useState<{role: "user"|"ai", content: string}[]>([]);
  const [suggestorInput, setSuggestorInput] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);

  const handleSuggestorSubmit = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const userText = overrideText ?? suggestorInput.trim();
    if (!userText || isSuggesting) return;

    if (!overrideText) setSuggestorInput("");
    
    // We only display the user message in the UI if they actually typed it
    const newMessages = [...suggestorMessages, { role: "user" as const, content: userText }];
    if (!overrideText) {
      setSuggestorMessages(newMessages);
    }
    setIsSuggesting(true);

    try {
      // Send clip context alongside the conversation
      const clipInfosWithFrames = clips.map((c, i) => ({
        index: i,
        name: c.name,
        duration: c.duration,
        frames: (c.frames ?? []).slice(0, 2),
        speechSegments: c.speechSegments,
        transcript: c.transcript,
        transcriptionStatus: c.transcriptionStatus
      }));

      const res = await fetch("/api/suggest-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, clips: clipInfosWithFrames }),
      });
      const data = await res.json();
      if (data.success && data.text) {
        // If it was a hidden automated request, we don't save the user's hidden prompt to state, just the AI response
        setSuggestorMessages(prev => overrideText ? [{ role: "ai", content: data.text }] : [...prev, { role: "ai", content: data.text }]);
      } else {
        setSuggestorMessages(prev => [...prev, { role: "ai", content: "Sorry, I ran into an error generating a suggestion. Try again." }]);
      }
    } catch (err) {
      console.error(err);
      setSuggestorMessages(prev => [...prev, { role: "ai", content: "Network error occurred." }]);
    } finally {
      setIsSuggesting(false);
    }
  };

  useEffect(() => {
    if (showSuggestor && suggestorMessages.length === 0) {
      handleSuggestorSubmit(undefined, "Please analyze my clips and provide exactly 3 different prompt suggestions focusing heavily on how to rearrange them and what transitions to use.");
    }
  }, [showSuggestor]);

  const handleDriveImport = async () => {
    if (!driveUrl) return;
    setImporting(true);
    setError(null);

    try {
      const listRes = await fetch("/api/import-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: driveUrl }),
      });

      const listData = await listRes.json();
      if (!listRes.ok) {
        throw new Error(listData.error ?? "Failed to list Google Drive folder contents.");
      }

      const driveFiles = listData.files ?? [];
      if (driveFiles.length === 0) {
        setError("No valid video or image files were found in this Drive folder.");
        setImporting(false);
        return;
      }

      let successCount = 0;
      const importedClips: any[] = [];

      for (let i = 0; i < driveFiles.length; i++) {
        const file = driveFiles[i];
        try {
          const fileRes = await fetch("/api/import-drive-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileId: file.id,
              filename: file.name,
              mimeType: file.mimeType,
            }),
          });

          const fileData = await fileRes.json();
          if (fileRes.ok && fileData.clip) {
            importedClips.push(fileData.clip);
            successCount++;
          } else {
            console.warn(`[Drive Import] Failed for ${file.name}:`, fileData.error);
          }
        } catch (fileErr) {
          console.warn(`[Drive Import] Failed to fetch file ${file.name}:`, fileErr);
        }
      }

      if (successCount > 0) {
        // Add all imported clips to the state
        setClips(prev => {
          const seen = new Set(prev.map(c => c.src));
          const deduped: UploadedClip[] = [];
          for (const c of importedClips) {
            if (seen.has(c.src)) continue;
            seen.add(c.src);
            deduped.push({
              id: c.id,
              name: c.name,
              src: c.src,
              duration: c.duration,
              thumbnail: "",
              frames: [],
            });
          }
          return [...prev, ...deduped];
        });

        setDriveUrl("");
      } else {
        setError("Google Drive import failed. No files could be downloaded.");
      }
    } catch (err: any) {
      console.error("[Drive Import]", err);
      setError(err.message ?? "Google Drive import failed.");
    } finally {
      setImporting(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Automatically fetch video metadata (durations, frames, dimensions) for cloud imported clips in the background
  useEffect(() => {
    const clipsToResolve = clips.filter(c => !c.file && (c.duration === 5 || !c.thumbnail));
    if (clipsToResolve.length === 0) return;

    clipsToResolve.forEach(async (clip) => {
      try {
        const tempVideo = document.createElement("video");
        tempVideo.src = clip.src;
        tempVideo.preload = "metadata";
        tempVideo.crossOrigin = "anonymous"; // Avoid CORS canvas issues if bucket has CORS enabled
        
        await new Promise((resolve, reject) => {
          tempVideo.onloadedmetadata = resolve;
          tempVideo.onerror = reject;
        });

        // Generate base64 thumbnail frames for Gemini Vision
        const frames: string[] = [];
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const W = 360;
        const H = 640;
        canvas.width = W;
        canvas.height = H;

        tempVideo.currentTime = Math.min(2, tempVideo.duration / 2); // Grab a frame from the beginning/middle
        await new Promise((resolve) => {
          tempVideo.onseeked = resolve;
        });

        ctx?.drawImage(tempVideo, 0, 0, W, H);
        const frameData = canvas.toDataURL("image/jpeg", 0.7);
        frames.push(frameData.split(",")[1]);

        setClips(prev => prev.map(c => c.id === clip.id ? {
          ...c,
          duration: tempVideo.duration || c.duration,
          width: tempVideo.videoWidth || undefined,
          height: tempVideo.videoHeight || undefined,
          thumbnail: frameData,
          frames,
        } : c));
      } catch (err) {
        console.warn(`[Drive Meta] Failed to load metadata for ${clip.name}:`, err);
      }
    });
  }, [clips]);

  const totalFootageDuration = clips.reduce((s, c) => s + c.duration, 0);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const videoFiles = Array.from(files).filter(f => f.type.startsWith("video/") || /\.(mov|mp4|webm|m4v|avi|mkv|mpeg|mpg|3gp|flv)$/i.test(f.name));
    if (!videoFiles.length) return;

    const newClips: UploadedClip[] = [];
    const total = videoFiles.length;

    for (let i = 0; i < total; i++) {
      const file = videoFiles[i];
      setIngesting({ current: i + 1, total, filename: file.name });
      try {
        const src = URL.createObjectURL(file);
        const meta = await getVideoMeta(file, src);
        newClips.push({
          id: uuidv4(), file, src,
          name: file.name.replace(/\.[^.]+$/, ""),
          duration: meta.duration,
          thumbnail: meta.thumbnail,
          frames: meta.frames,
          width: meta.width,
          height: meta.height,
        });
      } catch (err) {
        console.warn(`Failed to ingest ${file.name}:`, err);
      }
    }

    setIngesting(null);
    
    // Kick off background transcription for the new clips so suggest-prompt can use it
    let pendingCount = 0;
    newClips.forEach(c => { if (c.file instanceof File && c.file.size > 0) pendingCount++; });
    setTranscribingCount(prev => prev + pendingCount);

    newClips.forEach(async (c) => {
      if (c.file instanceof File && c.file.size > 0) {
        try {
          const audioWav = await extractAudioTrackAsWav(c.file);
          if (audioWav && audioWav.size > 500) {
            const formData = new FormData();
            formData.append("file", audioWav, "audio.wav");
            formData.append("duration", String(c.duration));
            const transRes = await fetch("/api/transcribe-clip", { method: "POST", body: formData });
            if (transRes.ok) {
              const transData = await transRes.json();
              setClips(prev => prev.map(existing => existing.id === c.id ? {
                ...existing,
                speechSegments: transData.captions ?? [],
                transcript: transData.fullTranscript ?? "",
                silenceWindows: transData.silenceWindows ?? [],
                transcriptionStatus: (transData.captions?.length ? "completed_with_speech" : "completed_no_speech") as any
              } : existing));
            }
          }
        } catch (e) {
          console.warn("[Background Transcription] skipped:", e);
        } finally {
          setTranscribingCount(prev => Math.max(0, prev - 1));
        }
      }
    });

    setClips(prev => {
      // Deduplicate by a content signature so two distinct files that happen to
      // share a name (e.g. "clip.mov") are both kept.
      const sig = (f?: File) => f ? `${f.name}-${f.size}-${f.lastModified}` : null;
      const seen = new Set(prev.map(c => c.file ? sig(c.file) : c.src));
      const deduped: UploadedClip[] = [];
      let foundDupes = 0;
      
      for (const c of newClips) {
        const s = c.file ? sig(c.file) : c.src;
        if (seen.has(s)) {
          foundDupes++;
          URL.revokeObjectURL(c.src); // skipped — release its object URL
          continue;
        }
        seen.add(s);
        deduped.push(c);
      }
      
      if (foundDupes > 0) {
        setTimeout(() => alert(`We skipped ${foundDupes} duplicate clip(s) you already uploaded.`), 100);
      }
      
      return [...prev, ...deduped];
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleRemoveClip = (id: string) => {
    setClips(prev => {
      const clip = prev.find(c => c.id === id);
      if (clip) URL.revokeObjectURL(clip.src);
      return prev.filter(c => c.id !== id);
    });
  };

  async function handleEdit() {
    if (clips.length === 0) {
      setError("Please upload at least one video clip first.");
      return;
    }
    setError(null);
    setProcessing(true);

    try {
      // Step 1: Transcribe dialogues and speech segments for every clip
      const clipInfosWithDialogue = [];

      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        
        // Skip redundant transcription if the background worker already handled it
        if (c.transcriptionStatus === "completed_with_speech" || c.transcriptionStatus === "completed_no_speech") {
          console.log(`[Footage] Clip ${i} ("${c.name}") used cached transcription.`);
          clipInfosWithDialogue.push({
            index: i,
            name: c.name,
            duration: c.duration,
            frames: c.frames ?? [],
            speechSegments: c.speechSegments ?? [],
            transcript: c.transcript ?? "",
            silenceWindows: c.silenceWindows ?? [],
          });
          continue;
        }

        setProcessingStep(`Transcribing dialogue (${i + 1}/${clips.length}): "${c.name}"...`);

        let speechSegments: any[] = [];
        let fullTranscript = "";
        let silenceWindows: any[] = [];

        try {
          if (c.file instanceof File && c.file.size > 0) {
            const audioWav = await extractAudioTrackAsWav(c.file);
            if (audioWav && audioWav.size > 500) {
              const formData = new FormData();
              formData.append("file", audioWav, "audio.wav");
              formData.append("duration", String(c.duration));

              const transRes = await fetch("/api/transcribe-clip", {
                method: "POST",
                body: formData,
              });

              if (transRes.ok) {
                const transData = await transRes.json();
                speechSegments = transData.captions ?? [];
                fullTranscript = transData.fullTranscript ?? "";
                silenceWindows = transData.silenceWindows ?? [];
                console.log(`[Footage] Clip ${i} ("${c.name}") transcribed: ${speechSegments.length} dialogue segments.`);
              }
            }
          }
        } catch (err) {
          console.warn(`[Footage] Dialogue transcription skipped for "${c.name}":`, err);
        }

        clipInfosWithDialogue.push({
          index: i,
          name: c.name,
          duration: c.duration,
          frames: c.frames ?? [],
          speechSegments,
          transcript: fullTranscript,
          silenceWindows,
        });
      }

      let timelineData = null;
      let score: number | null = null;
      let feedback: string | null = null;

      const effectivePrompt = prompt.trim() || activeTemplate?.editorialPrompt || "";
      if (effectivePrompt) {
        setProcessingStep(`${assistantName} is analyzing dialogues, cuts & narrative flow...`);
        try {
          const res = await fetch("/api/lineup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: effectivePrompt,
              workspaceSlug: "asaya",
              aspectRatio: aspectRatio,
              templateId: urlTemplateId || activeTemplate?.id,
              qualityMode: qualityMode,
              references: references.length > 0 ? references : undefined,
              referenceProfile: referenceProfile || undefined,
              geminiClips: clipInfosWithDialogue.map((c) => ({
                id: clips[c.index].id,
                mimeType: "video/mp4",
                name: c.name,
                index: c.index,
                duration: c.duration,
                frames: c.frames,
                speechSegments: c.speechSegments,
                transcript: c.transcript,
                transcriptionStatus: c.speechSegments?.length ? "completed_with_speech" : "completed_no_speech"
              }))
            }),
          });
          const data = await res.json();
          const receivedTimeline = data.lineup?.timeline ?? data.timeline;
          if (receivedTimeline?.scenes?.length) {
            timelineData = receivedTimeline;
            score = data.evaluation?.overallScore ?? null;
            feedback = data.evaluation?.improvements?.join("\n") ?? null;
          } else {
            throw new Error(data.error || "Failed to generate timeline");
          }
        } catch (apiErr) {
          console.warn("AI edit plan failed, using defaults:", apiErr);
        }
      }

      setProcessingStep("Loading into editor...");

      // The EditorStore is completely persistent and shared across pages natively!
      // We do NOT need to cram megabytes of data into sessionStorage.
      // 1. Add all clips (including heavy raw File references) to the global store safely:
      clips.forEach(c => {
        useEditorStore.getState().addClip({
          id: c.id, name: c.name, src: c.src, file: c.file,
          type: "video" as const, duration: c.duration, thumbnail: c.thumbnail,
          speechSegments: c.speechSegments,
          transcript: c.transcript,
          transcriptionStatus: c.transcriptionStatus
        });
      });

      // 2. Add AI analysis to store
      useEditorStore.getState().setAiMetadata(prompt.trim(), score ?? 0, feedback ?? "");

      // 3. Load full timeline into store
      if (timelineData) {
        const mappedScenes = (timelineData as any).scenes.map((s: any, idx: number) => {
            const matchedClip = clips.find(c => c.id === s.clipId || c.name === s.label) || clips[idx % clips.length];
            const sourceDur = matchedClip?.duration ?? s.duration;
            const trimStart = typeof s.clipTrimStart === "number" ? Math.max(0, s.clipTrimStart) : 0;
            const trimEnd = typeof s.clipTrimEnd === "number" ? Math.min(sourceDur, s.clipTrimEnd) : (trimStart + (s.duration || sourceDur));
            const speed = s.playbackRate ?? 1.0;
            const rawDur = trimEnd - trimStart;
            // Prevent empty or negative scene durations
            const activeDuration = Math.max(0.1, (rawDur > 0 ? rawDur : sourceDur) / speed);

            return {
              ...s,
              clipSrc: matchedClip?.src || s.clipSrc,
              clipTrimStart: trimStart,
              clipTrimEnd: trimEnd > trimStart ? trimEnd : (trimStart + sourceDur),
              duration: activeDuration,
            };
          });

        loadTimeline({
          scenes: mappedScenes,
          audioTracks: ((timelineData as any).audioLayers || []).map((a: any) => ({
            id: a.id,
            name: a.id,
            src: a.src ?? "",
            duration: a.endTime - a.startTime,
            volume: a.volume ?? 0.8,
            fadeIn: a.fadeIn ?? 0.5,
            fadeOut: a.fadeOut ?? 1.0,
            startTime: a.startTime,
            muted: false,
            type: "bgm"
          })),
          totalDuration: mappedScenes.reduce((sum: number, sc: any) => sum + sc.duration, 0),
          aspectRatio,
        });
      } else {
        // Fallback if AI fails: just load the clips raw
        loadTimeline({
          scenes: clips.map((c, i) => ({
            id: uuidv4(), order: i, label: c.name, description: c.name,
            duration: c.duration, playbackRate: 1, clipId: c.id, clipSrc: c.src,
            clipType: "video", clipTrimStart: 0, clipTrimEnd: c.duration,
            captions: [], transition: { type: "zoom-in", duration: 0.5 },
            mood: "neutral", colorGrade: null, colorAdjustments: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 },
            effects: [], muted: false,
          })),
          audioTracks: [],
          totalDuration: clips.reduce((s, c) => s + c.duration, 0),
          aspectRatio,
        });
      }
      
      // Tell the editor to open the transition tab by default
      useEditorStore.getState().setLeftTab("transitions");

      // Set a tiny flag in session storage just to tell the editor we came from the footage page
      // but do NOT serialize any clips or scenes here to prevent Chrome OOM crash.
      sessionStorage.setItem("vydeoai_pending_footage_flag", "true");

      setProcessingStep("Opening editor...");
      await new Promise(r => setTimeout(r, 150));

      router.push("/editor/footage");
    } catch (err) {
      console.error("handleEdit error:", err);
      setError("Something went wrong — please try again.");
      setProcessing(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", padding: "48px 0" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 32px" }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={{ marginBottom: 40 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "var(--r-lg)",
              background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
            }}>
              <Scissors size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Footage Editor</h1>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Upload your clips, describe your vision — {assistantName} does the edit</p>
              </div>
          </div>
        </motion.div>

        {/* Active Template Banner */}
        {activeTemplate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(168,85,247,0.12) 100%)",
              border: "1px solid rgba(99,102,241,0.35)",
              borderRadius: "var(--r-xl)",
              padding: "14px 18px",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              boxShadow: "0 8px 24px rgba(99,102,241,0.15)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "var(--r-md)",
                background: "var(--accent)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  Applied Template: {activeTemplate.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Editorial brief, {activeTemplate.pacing} pacing, and {activeTemplate.musicStyle} music are pre-configured. Just add clips and click Generate!
                </div>
                {references.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--accent-light)", fontWeight: 700 }}>
                      📎 {references.length} Style Reference(s):
                    </span>
                    {references.map((r) => (
                      <span key={r.id} style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: "var(--r-sm)",
                        background: "rgba(255,255,255,0.1)", color: "var(--text-primary)",
                        display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>
                        {r.type === "video" ? "🎬 " : "🖼️ "}{r.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, padding: "4px 9px", borderRadius: "var(--r-full)", background: "rgba(255,255,255,0.08)", color: "var(--text-primary)", fontWeight: 600 }}>
                {activeTemplate.platform}
              </span>
              <span style={{ fontSize: 10, padding: "4px 9px", borderRadius: "var(--r-full)", background: "rgba(255,255,255,0.08)", color: "var(--text-primary)", fontWeight: 600 }}>
                {activeTemplate.targetDurationMin}-{activeTemplate.targetDurationMax}s
              </span>
            </div>
          </motion.div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "start" }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Drop zone */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
            >
              <input
                ref={fileInputRef}
                id="footage-file-input"
                type="file"
                accept="video/*,video/quicktime,video/mp4,video/webm,video/x-msvideo"
                multiple
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
              <div
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  borderRadius: "var(--r-2xl)",
                  border: `2px dashed ${dragging ? "var(--accent)" : clips.length > 0 ? "var(--border)" : "var(--border-strong)"}`,
                  background: dragging
                    ? "rgba(99,102,241,0.06)"
                    : clips.length > 0 ? "var(--bg-elevated)" : "rgba(255,255,255,0.02)",
                  padding: clips.length > 0 ? "16px" : "48px 24px",
                  cursor: clips.length === 0 ? "pointer" : "default",
                  transition: "border-color 0.15s, background 0.15s",
                  minHeight: clips.length > 0 ? 0 : 200,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: clips.length === 0 ? "center" : "stretch",
                  justifyContent: clips.length === 0 ? "center" : "flex-start",
                  gap: 16,
                }}
              >
                {clips.length === 0 ? (
                  <>
                    <div style={{
                      width: 56, height: 56, borderRadius: "var(--r-xl)",
                      background: dragging ? "rgba(99,102,241,0.15)" : "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Upload size={22} color={dragging ? "var(--accent)" : "var(--text-tertiary)"} />
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                        Drop your video clips here
                      </p>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        or click to browse · MP4, MOV, AVI, WebM supported
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Clip Grid */}
                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", 
                      gap: 10, 
                      paddingBottom: 4,
                      maxHeight: "50vh",
                      overflowY: "auto",
                      paddingRight: 8 // scrollbar spacing
                    }}>
                      <AnimatePresence>
                        {clips.map((clip, i) => (
                          <ClipCard
                            key={clip.id}
                            clip={clip}
                            index={i}
                            onRemove={() => handleRemoveClip(clip.id)}
                          />
                        ))}
                      </AnimatePresence>

                      {/* Add more button */}
                      <motion.div
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          width: 160, flexShrink: 0, borderRadius: "var(--r-lg)",
                          border: "2px dashed var(--border-strong)",
                          display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center",
                          gap: 8, cursor: "pointer", padding: "24px 12px",
                          background: "rgba(255,255,255,0.02)",
                          transition: "border-color 0.15s, background 0.15s",
                          minHeight: 128,
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent-border)";
                          (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.04)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-strong)";
                          (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)";
                        }}
                      >
                        <Upload size={18} color="var(--text-tertiary)" />
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, textAlign: "center" }}>Add more clips</span>
                      </motion.div>
                    </div>

                    {/* Summary bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Film size={13} color="var(--text-tertiary)" />
                          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                            {clips.length} clip{clips.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Clock size={13} color="var(--text-tertiary)" />
                          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                            {formatDuration(totalFootageDuration)} total
                          </span>
                        </div>
                        {ingesting && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "2px 8px", borderRadius: "var(--r-sm)",
                            background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.35)",
                            fontSize: 11, fontWeight: 600, color: "#C7D2FE"
                          }}>
                            Processing {ingesting.current} / {ingesting.total}...
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (transcribingCount === 0) setShowSuggestor(true);
                        }}
                        disabled={transcribingCount > 0}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 12px", borderRadius: "var(--r-md)",
                          background: transcribingCount > 0 ? "var(--bg-elevated)" : "var(--accent-subtle)", 
                          border: `1px solid ${transcribingCount > 0 ? "var(--border)" : "var(--accent-border)"}`,
                          color: transcribingCount > 0 ? "var(--text-muted)" : "var(--accent-light)", 
                          fontSize: 11, fontWeight: 700,
                          cursor: transcribingCount > 0 ? "wait" : "pointer", transition: "all 0.15s ease",
                        }}
                      >
                        <Sparkles size={13} color={transcribingCount > 0 ? "var(--text-muted)" : "var(--accent)"} />
                        {transcribingCount > 0 ? `Transcribing (${transcribingCount})⏳` : 'Prompt Suggestor'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>

            {/* Google Drive Import Card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.08 }}
              style={{
                padding: 16,
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-2xl)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "var(--r-lg)",
                  background: "rgba(99,102,241,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <HardDrive size={16} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text-primary)", textAlign: "left" }}>Import from Google Drive Folder</h4>
                  <p style={{ margin: 0, fontSize: 10, color: "var(--text-tertiary)", textAlign: "left" }}>Automatically scans and downloads all files inside subfolders recursively</p>
                </div>
              </div>
              
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  placeholder="Paste Google Drive shared folder URL..."
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  disabled={importing}
                  style={{
                    flex: 1,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-xl)",
                    color: "var(--text-primary)",
                    padding: "0 14px",
                    fontSize: 13,
                    height: 38,
                    outline: "none",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--accent)"}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--border)"}
                />
                <button
                  type="button"
                  onClick={handleDriveImport}
                  disabled={importing || !driveUrl}
                  style={{
                    background: importing || !driveUrl ? "var(--bg-elevated)" : "var(--accent)",
                    color: importing || !driveUrl ? "var(--text-tertiary)" : "#fff",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-xl)",
                    padding: "0 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: importing || !driveUrl ? "default" : "pointer",
                    transition: "background 0.15s, color 0.15s",
                    height: 38,
                  }}
                >
                  {importing ? "Importing…" : "Import Folder"}
                </button>
              </div>
              <p style={{ margin: "6px 0 0 0", fontSize: 11, color: "var(--text-tertiary)", textAlign: "left" }}>
                💡 Ensure the Google Drive folder sharing is set to **\"Anyone with the link can view\"**.
              </p>
            </motion.div>

            {/* Prompt textarea */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
            >
              <label htmlFor="edit-direction" style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                Edit Direction
              </label>
              <div style={{
                borderRadius: "var(--r-xl)",
                boxShadow: focused ? "var(--glow-accent)" : "none",
                transition: "box-shadow 0.2s ease",
              }}>
                <textarea
                  id="edit-direction"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleEdit(); }}
                  placeholder="Describe exactly how to edit the clips — who appears first/last, transitions, brightness, pacing, what to cut. AI reads every instruction. e.g. 'Start with the girl, zoom-out transition between all clips, increase brightness 20%, end with the guy in sunglasses'"
                  style={{
                    width: "100%", minHeight: 100,
                    background: "rgba(255,255,255,0.04)",
                    backdropFilter: "blur(16px)",
                    border: `1.5px solid ${focused ? "var(--accent-border)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: "var(--r-xl)",
                    padding: "16px 18px",
                    fontSize: 15, color: "var(--text-primary)",
                    fontFamily: "var(--font-sans)", lineHeight: 1.6,
                    resize: "none", outline: "none",
                    transition: "border-color 0.15s",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Quick prompt chips */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {PROMPT_EXAMPLES.slice(0, 4).map(ex => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    style={{
                      padding: "5px 10px", borderRadius: "var(--r-full)",
                      background: prompt === ex ? "var(--accent-subtle)" : "var(--bg-elevated)",
                      border: `1px solid ${prompt === ex ? "var(--accent-border)" : "var(--border)"}`,
                      color: prompt === ex ? "var(--accent-light)" : "var(--text-secondary)",
                      fontSize: 11, fontWeight: 500, cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Quality Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "4px",
                background: "var(--bg-elevated)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)"
              }}
            >
              <button
                onClick={() => setQualityMode("standard")}
                style={{
                  flex: 1, padding: "10px", borderRadius: "var(--r-md)",
                  background: qualityMode === "standard" ? "var(--accent)" : "transparent",
                  color: qualityMode === "standard" ? "#fff" : "var(--text-secondary)",
                  border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s"
                }}
              >
                Standard (Gemini)
              </button>
              <button
                onClick={() => setQualityMode("premium")}
                style={{
                  flex: 1, padding: "10px", borderRadius: "var(--r-md)", display: "flex", justifyContent: "center", alignItems: "center", gap: 6,
                  background: qualityMode === "premium" ? "linear-gradient(135deg, #FFD700 0%, #F7971E 100%)" : "transparent",
                  color: qualityMode === "premium" ? "#000" : "var(--text-secondary)",
                  border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s"
                }}
              >
                <Sparkles size={14} /> Premium (Kling 4.0)
              </button>
            </motion.div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 16px", borderRadius: "var(--r-lg)",
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                    fontSize: 13, color: "#F87171",
                  }}
                >
                  <AlertCircle size={15} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Generate button */}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.15 }}
              whileTap={!processing ? { scale: 0.98 } : {}}
              whileHover={!processing ? { scale: 1.01 } : {}}
              onClick={handleEdit}
              disabled={processing}
              style={{
                width: "100%", height: 56, borderRadius: "var(--r-xl)",
                background: processing
                  ? "var(--bg-elevated)"
                  : "linear-gradient(135deg, #6366F1, #8B5CF6)",
                border: processing ? "1px solid var(--border)" : "none",
                color: processing ? "var(--text-secondary)" : "#fff",
                fontSize: 16, fontWeight: 800, cursor: processing ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                boxShadow: processing ? "none" : "0 4px 24px rgba(99,102,241,0.45)",
                letterSpacing: "-0.01em",
                transition: "all 0.2s ease",
              }}
            >
              {processing ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles size={16} />
                  </motion.div>
                  {processingStep}
                </>
              ) : (
                <>
                  <Scissors size={18} />
                  {prompt.trim() ? `Edit with ${assistantName}` : "Auto-Edit Footage"}
                  <ArrowRight size={16} />
                </>
              )}
            </motion.button>
          </div>

          {/* Right column — options */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {/* Aspect Ratio */}
            <div style={{
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)", padding: "16px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                Output Format
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {ASPECT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAspectRatioLocal(opt.value)}
                    style={{
                      padding: "8px 6px", borderRadius: "var(--r-md)",
                      background: aspectRatio === opt.value ? "var(--accent-subtle)" : "var(--bg-base)",
                      border: `1.5px solid ${aspectRatio === opt.value ? "var(--accent-border)" : "var(--border)"}`,
                      color: aspectRatio === opt.value ? "var(--accent-light)" : "var(--text-secondary)",
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.12s",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{opt.label}</div>
                    <div style={{ fontSize: 9, opacity: 0.7, marginTop: 1 }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6, padding: "0 4px" }}>
              <strong style={{ color: "var(--text-secondary)" }}>Tips:</strong> Longer prompts = better results. Mention mood, pace, audience, or platform. You can always refine in the editor.
            </div>
          </motion.div>
        </div>
      </div>
      {/* AI Prompt Suggestor Modal Overlay */}
      <AnimatePresence>
        {showSuggestor && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ 
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', 
              zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', 
              padding: 24, backdropFilter: 'blur(4px)' 
            }}
            onClick={() => setShowSuggestor(false)}
          >
            <motion.div
              initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              style={{ 
                width: '100%', maxWidth: 500, background: 'var(--bg-base)', 
                border: '1px solid var(--border)', borderRadius: 'var(--r-2xl)', 
                display: 'flex', flexDirection: 'column', height: '80vh', overflow: 'hidden', 
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)' 
              }}
            >
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color="var(--accent)" />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{assistantName} (Prompt Helper)</span>
                </div>
                <button onClick={() => setShowSuggestor(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                  <X size={16}/>
                </button>
              </div>

              {/* Chat Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {suggestorMessages.length === 0 && (
                  <div style={{ alignSelf: 'flex-start', background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: '12px 12px 12px 2px', fontSize: 13, color: 'var(--text-secondary)', maxWidth: '85%', lineHeight: 1.5 }}>
                    Hi there! I'm {assistantName}. I am analyzing your {clips.length} uploaded clips...
                  </div>
                )}
                
                {suggestorMessages.map((m, i) => {
                  const isAi = m.role === 'ai';
                  
                  let displayContent = m.content;
                  const suggestions: string[] = [];
                  
                  if (isAi) {
                    const regex = /<suggested_prompt>([\s\S]*?)(?:<\/suggested_prompt>|$)/g;
                    let match;
                    while ((match = regex.exec(m.content)) !== null) {
                      suggestions.push(match[1].trim());
                    }
                    displayContent = m.content.replace(/<suggested_prompt>[\s\S]*?(?:<\/suggested_prompt>|$)/g, "").trim();
                  }

                  return (
                    <div key={i} style={{ 
                      alignSelf: isAi ? 'flex-start' : 'flex-end', 
                      display: 'flex', flexDirection: 'column', gap: 8,
                      maxWidth: '85%' 
                    }}>
                      {displayContent && (
                        <div style={{ 
                          background: isAi ? 'var(--bg-elevated)' : 'var(--accent)', 
                          color: isAi ? 'var(--text-secondary)' : '#fff',
                          padding: '12px 16px', 
                          borderRadius: isAi ? '12px 12px 12px 2px' : '12px 12px 2px 12px', 
                          fontSize: 13, lineHeight: 1.5,
                          whiteSpace: 'pre-wrap'
                        }}>
                          {displayContent}
                          
                          {(displayContent.includes("error generating a suggestion") || displayContent.includes("Network error")) && (
                            <button
                              onClick={() => {
                                // Remove the error message and trigger the automated request again
                                setSuggestorMessages(prev => prev.slice(0, -1));
                                handleSuggestPrompt(true, "Please analyze the uploaded clips and provide 3 prompt suggestions.");
                              }}
                              style={{
                                marginTop: 12, padding: "8px 16px", background: "var(--bg-surface)",
                                border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                                color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 6
                              }}
                              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--text-muted)"}
                              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                            >
                              <Undo2 size={14} /> Try Again
                            </button>
                          )}
                        </div>
                      )}
                      
                      {suggestions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                          {suggestions.map((suggestedPrompt, idx) => (
                            <div key={idx} style={{
                              background: 'rgba(99, 102, 241, 0.04)',
                              border: '1px solid var(--accent-border)',
                              borderRadius: '12px', padding: '16px',
                              display: 'flex', flexDirection: 'column', gap: 12
                            }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Suggestion {idx + 1}
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontStyle: 'italic', background: 'var(--bg-base)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                                "{suggestedPrompt}"
                              </div>
                              <button
                                onClick={() => {
                                  setPrompt(suggestedPrompt);
                                  setShowSuggestor(false);
                                }}
                                style={{
                                  background: 'var(--accent)', color: '#fff', border: 'none',
                                  padding: '8px 0', borderRadius: '6px', fontSize: 12, fontWeight: 700,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                              >
                                <ArrowRight size={14} /> Use this prompt
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {isSuggesting && (
                  <div style={{ alignSelf: 'flex-start', background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: '12px 12px 12px 2px', fontSize: 13, color: 'var(--text-tertiary)' }}>
                    Thinking...
                  </div>
                )}
              </div>

              {/* Input Area */}
              <form onSubmit={handleSuggestorSubmit} style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={suggestorInput}
                    onChange={e => setSuggestorInput(e.target.value)}
                    placeholder="Describe what you want..."
                    disabled={isSuggesting}
                    style={{
                      flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)',
                      borderRadius: 'var(--r-full)', padding: '10px 16px', fontSize: 13,
                      color: 'var(--text-primary)', outline: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!suggestorInput.trim() || isSuggesting}
                    style={{
                      background: suggestorInput.trim() && !isSuggesting ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: suggestorInput.trim() && !isSuggesting ? '#fff' : 'var(--text-tertiary)',
                      border: 'none', width: 40, height: 40, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: suggestorInput.trim() && !isSuggesting ? 'pointer' : 'default',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type { UploadedClip, EditPlan } from "@/lib/footagePlan";
export { buildScenesFromPlan } from "@/lib/footagePlan";
