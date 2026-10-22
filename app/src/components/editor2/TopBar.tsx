"use client";

import { useState } from "react";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import { useEditorStore } from "@/store/editorStore";
import { Button, useToast, Icons, Spinner } from "@/components/ui";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to convert media to data URL."));
      } else {
        resolve(result);
      }
    };
    reader.onerror = () => reject(new Error("Failed to convert media to data URL."));
    reader.readAsDataURL(blob);
  });
}

function getExtensionFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.href);
    const match = parsed.pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

function Btn({ children, onClick, title, variant = "ghost", style: s }: {
  children: React.ReactNode; onClick?: () => void; title?: string;
  variant?: "ghost" | "primary" | "secondary"; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 12px", borderRadius: "var(--r-md)", fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: "none", fontFamily: "var(--font-sans)",
    transition: "all 0.12s ease", whiteSpace: "nowrap",
    ...(variant === "ghost" ? {
      background: "transparent", color: "var(--text-secondary)",
    } : variant === "primary" ? {
      background: "var(--accent)", color: "#FFFFFF",
      boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
    } : {
      background: "var(--bg-elevated)", color: "var(--text-secondary)",
      border: "1px solid var(--border)",
    }),
    ...s,
  };
  return (
    <button style={base} onClick={onClick} title={title}
      onMouseEnter={e => {
        if (variant === "ghost") { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-primary)"; }
        if (variant === "primary") e.currentTarget.style.background = "var(--accent-light)";
        if (variant === "secondary") { e.currentTarget.style.background = "var(--bg-overlay)"; e.currentTarget.style.color = "var(--text-primary)"; }
      }}
      onMouseLeave={e => {
        if (variant === "ghost") { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }
        if (variant === "primary") e.currentTarget.style.background = "var(--accent)";
        if (variant === "secondary") { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-secondary)"; }
      }}>
      {children}
    </button>
  );
}

function Svg({ d, size = 13 }: { d: string | string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

function uploadBinaryWithProgress(
  file: Blob,
  ext: string,
  onProgress?: (percent: number) => void
): Promise<{ filepath: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("ext", ext);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.round((event.loaded / event.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          reject(new Error("Invalid server response"));
        }
      } else {
        reject(new Error(`Server returned ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.open("POST", "/api/upload-binary");
    xhr.send(formData);
  });
}

export default function TopBar({ projectId }: { projectId?: string }) {
  const { projectName, isDirty, setProjectName, scenes, audioTracks, aspectRatio, clips } = useEditorStore();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(projectName);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState("");
  const toast = useToast();

  const buildRenderScene = async (scene: any, onUploadProgress?: (percent: number) => void) => {
    const clip = scene.clipId ? clips.find((item) => item.id === scene.clipId) : null;
    let clipData: string | null = null;
    let clipMime = clip?.file?.type ?? "";
    let clipExt = clip?.file?.name?.split(".").pop()?.toLowerCase() ?? getExtensionFromUrl(scene.clipSrc ?? "") ?? "";
    
    // We keep a reference to the raw Blob/File instead of eagerly converting to base64
    let rawMediaBlob: Blob | File | null = null;

    if (clip?.file instanceof File && clip.file.size > 0) {
      rawMediaBlob = clip.file;
      clipMime = clip.file.type || clipMime;
      clipExt = clipExt || (clip.file.name.split(".").pop()?.toLowerCase() ?? "");
    } else if (clip?.file instanceof File && clip.file.size === 0) {
      if (scene.clipSrc) {
        console.warn(`[Export] Skipping empty placeholder file for scene "${scene.label}" and falling back to clipSrc.`);
      } else {
        console.warn(`[Export] Scene "${scene.label}" has no media because the attached file is empty and no clipSrc fallback is available.`);
      }
    }

    if (!rawMediaBlob && scene.clipSrc) {
      if (String(scene.clipSrc).startsWith("http://") || String(scene.clipSrc).startsWith("https://") || String(scene.clipSrc).startsWith("gs://")) {
        console.log(`[Export] Remote media URL found — server will fetch directly for scene "${scene.label}".`);
      } else {
        let response = null;
        try {
          response = await fetch(scene.clipSrc);
        } catch (err) {
          console.warn(`[Export] Network error fetching clip for scene "${scene.label}":`, err);
        }
        if (response && response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) {
            rawMediaBlob = blob;
            clipMime = blob.type || clipMime;
            clipExt = clipExt || getExtensionFromUrl(scene.clipSrc) ?? "";
          }
        }
      }
    }

    // --- EC2 DIRECT BINARY UPLOAD BYPASS ---
    // Instead of failing over to base64 which crashes the browser, we stream the raw binary
    // directly to the EC2 server's /var/tmp SSD space using standard FormData multipart uploads.
    if (rawMediaBlob) {
      console.log(`[Export] Media detected for scene "${scene.label}" (${(rawMediaBlob.size / 1024 / 1024).toFixed(2)} MB). Streaming directly to EC2 server...`);
      try {
        const data = await uploadBinaryWithProgress(rawMediaBlob, clipExt || "mp4", onUploadProgress);
        scene.clipSrc = `local://${data.filepath}`;
        console.log(`[Export] Stream to EC2 successful for "${scene.label}" -> ${data.filepath}`);
        rawMediaBlob = null;
        clipData = null;
      } catch (err) {
        console.warn(`[Export] Direct stream to EC2 crashed for scene "${scene.label}".`, err);
        throw new Error(`Failed to upload scene "${scene.label}". Network dropped or file too large.`);
      }
    }

    if (typeof clipData === "string") {
      const dataStr = clipData as string;
      const commaIndex = dataStr.indexOf(",");
      const header = commaIndex >= 0 ? dataStr.slice(0, commaIndex) : "";
      const base64 = commaIndex >= 0 ? dataStr.slice(commaIndex + 1) : "";

      if (!header.includes(";base64") || !base64.trim()) {
        console.warn(`[Export] Scene "${scene.label}" returned invalid base64.`);
        clipData = null;
      }
    }

    return {
      id: scene.id,
      label: scene.label,
      duration: scene.duration,
      clipType: scene.clipType ?? clip?.type ?? "video",
      clipMime: clipMime || undefined,
      clipExt: clipExt || undefined,
      clipSrc: scene.clipSrc ?? clip?.src ?? undefined,
      clipData: clipData ?? undefined,
      playbackSpeed: scene.playbackRate ?? 1,
      clipTrimStart: scene.clipTrimStart,
      clipTrimEnd: scene.clipTrimEnd,
      visualEffect: scene.visualEffect,
      colorGrade: scene.colorGrade,
      colorAdjustments: scene.colorAdjustments,
      transition: scene.transition,
      captions: scene.captions?.map((caption: any) => ({
        text: caption.text,
        startTime: caption.startTime,
        endTime: caption.endTime,
        fontFamily: caption.fontFamily,
        fontSize: caption.fontSize,
        color: caption.color,
        bgColor: caption.bgColor,
        bgOpacity: caption.bgOpacity,
        bold: caption.bold,
        x: caption.x,
        y: caption.y,
        align: caption.align,
      })) ?? [],
    };
  };

  async function compressTextPayload(text: string): Promise<string | null> {
    if (typeof CompressionStream === "undefined") {
      return null;
    }

    try {
      const stream = new CompressionStream("gzip");
      const writer = stream.writable.getWriter();
      
      // Do NOT await writer.write here, it causes a stream deadlock for payloads > HighWaterMark
      writer.write(new TextEncoder().encode(text)).finally(() => writer.close());

      // Let the browser handle the stream reading highly efficiently via Response API
      const blob = await new Response(stream.readable).blob();

      const base64Url = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });

      const commaIndex = base64Url.indexOf(",");
      return commaIndex !== -1 ? base64Url.slice(commaIndex + 1) : null;
    } catch (err) {
      console.error("[Export] Compression stream error:", err);
      return null;
    }
  }

  const handleExport = async () => {
    setExporting(true);
    setExportProgress(0);
    setExportStatusText("Preparing clips...");
    try {
      const payloadScenes = [];
      const totalScenes = scenes.length;

      // Process scenes sequentially (one-by-one) instead of Promise.all
      // to prevent the browser from holding multiple multi-gigabyte blobs in RAM simultaneously.
      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];
        setExportStatusText(`Uploading clip ${i + 1}/${totalScenes} (0%)`);
        setExportProgress(0);

        const renderedScene = await buildRenderScene(scene, (percent) => {
          setExportStatusText(`Uploading clip ${i + 1}/${totalScenes} (${percent}%)`);
          setExportProgress(percent);
        });
        payloadScenes.push(renderedScene);
      }

      let audioPayload = undefined;
      const activeAudio = audioTracks.find((t) => !t.muted);
      if (activeAudio) {
        let audioData = null;
        if (activeAudio.file instanceof File && activeAudio.file.size > 0) {
          audioData = await fileToDataUrl(activeAudio.file);
        } else if (activeAudio.src) {
          if (String(activeAudio.src).startsWith("http://") || String(activeAudio.src).startsWith("https://") || String(activeAudio.src).startsWith("gs://")) {
            console.log("[Export] Remote audio track found — skipping browser download, server will fetch directly:", activeAudio.src);
            audioData = activeAudio.src;
          } else {
            console.log("[Export] Fetching local audio blob in browser:", activeAudio.src);
            try {
              const audioRes = await fetch(activeAudio.src);
              if (audioRes.ok) {
                const audioBlob = await audioRes.blob();
                audioData = await blobToDataUrl(audioBlob);
              }
            } catch (err) {
              console.warn("[Export] Could not fetch audio blob:", err);
            }
          }
        }

        if (audioData) {
          if (audioData.startsWith("data:")) {
            setExportStatusText("Uploading background audio (0%)...");
            setExportProgress(0);
            try {
              const b64Data = audioData.split(",")[1];
              const byteCharacters = atob(b64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const uploadBlob = new Blob([byteArray], { type: "audio/mpeg" });

              const data = await uploadBinaryWithProgress(uploadBlob, "mp3", (percent) => {
                setExportStatusText(`Uploading audio (${percent}%)`);
                setExportProgress(percent);
              });

              audioData = `local://${data.filepath}`;
              console.log(`[Export] Stream audio to EC2 successful -> ${data.filepath}`);
            } catch (err) {
              console.warn(`[Export] Direct audio upload failed, falling back to base64.`, err);
            }
          }

          audioPayload = {
            src: audioData,
            volume: activeAudio.volume ?? 0.7,
            fadeIn: activeAudio.fadeIn ?? 0.5,
            fadeOut: activeAudio.fadeOut ?? 1.0,
          };
        }
      }

      setExportStatusText("Submitting render job...");
      setExportProgress(0);

      const payload = {
        scenes: payloadScenes,
        audio: audioPayload,
        aspectRatio,
        totalDuration: scenes.reduce((s, sc) => s + sc.duration, 0),
        outputFilename: `${projectName.replace(/\s+/g, "-")}-${Date.now()}.mp4`,
      };

      const payloadText = JSON.stringify(payload);
      const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      const compressedPayload = isLocalhost ? null : await compressTextPayload(payloadText);
      const requestBody = compressedPayload
        ? JSON.stringify({
            compressed: true,
            encoding: "gzip",
            payload: compressedPayload,
          })
        : payloadText;

      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        console.error("Export failed", errorBody);
        toast.error("Failed to start video rendering. Please try again.");
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.startsWith("video/")) {
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${projectName.replace(/\s+/g, "-")}-${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          document.body.removeChild(a);
        }, 1000);
        return;
      }
      const data = await res.json().catch(() => ({}));
      
      let finalJob = data;
      
      if (data.jobId && (!data.downloadUrl || data.status === "pending" || data.status === "processing")) {
        console.log(`[Export] Server is rendering asynchronously. Entering browser polling loop for jobId: ${data.jobId}`);
        setExportStatusText("Rendering video: 0%");
        setExportProgress(0);

        let attempts = 0;
        const maxAttempts = 400; // 400 * 2.5s = 1000 seconds
        let completed = false;
        
        while (attempts < maxAttempts) {
          attempts++;
          
          await new Promise((resolve) => setTimeout(resolve, 2500));
          
          const statusRes = await fetch(`/api/render/status?jobId=${data.jobId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === "completed") {
              finalJob = statusData;
              completed = true;
              setExportStatusText("Complete! Downloading...");
              setExportProgress(100);
              break;
            } else if (statusData.status === "failed") {
              throw new Error(statusData.error || "The render worker failed to compile the video.");
            } else {
              const renderPct = typeof statusData.progress === "number" ? statusData.progress : 0;
              setExportProgress(renderPct);
              setExportStatusText(`Rendering video: ${renderPct}%`);
            }
          }
        }
        
        if (!completed) {
          throw new Error("The rendering job timed out. Your video is still compiling on the server, please check back in a few minutes.");
        }
      }

      if (finalJob.downloadUrl) {
        const a = document.createElement("a");
        a.href = finalJob.downloadUrl; a.download = finalJob.filename ?? "export.mp4";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast.success("Export complete! Downloading video...");
      }
    } catch (err: any) {
      console.error("[Export Error]:", err);
      toast.error(err.message || "An unexpected error occurred during export. Please check your network and try again.");
    } finally {
      setExporting(false);
      setExportProgress(0);
      setExportStatusText("");
    }
  };

  return (
    <header style={{
      height: 48, display: "flex", alignItems: "center",
      padding: "0 12px", gap: 8, flexShrink: 0,
      background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
    }}>
      {/* Back + Logo */}
      <Link href="/" style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: "var(--r-md)", textDecoration: "none",
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        color: "var(--text-muted)", transition: "all 0.12s ease", flexShrink: 0,
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
        <Svg d="M15 18l-6-6 6-6" />
      </Link>

      {/* Logo mark */}
      <div style={{
        width: 26, height: 26, borderRadius: 7,
        background: "linear-gradient(135deg, #6366F1, #A78BFA)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 1.5L11.5 7L2.5 12.5V1.5Z" fill="#08080A"/>
        </svg>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

      {/* Project name */}
      {editingName ? (
        <input
          autoFocus value={nameVal}
          onChange={e => setNameVal(e.target.value)}
          onBlur={() => { setProjectName(nameVal); setEditingName(false); }}
          onKeyDown={e => {
            if (e.key === "Enter") { setProjectName(nameVal); setEditingName(false); }
            if (e.key === "Escape") { setNameVal(projectName); setEditingName(false); }
          }}
          style={{
            background: "var(--bg-elevated)", border: "1px solid var(--border-focus)",
            borderRadius: "var(--r-sm)", padding: "4px 8px", fontSize: 13, fontWeight: 600,
            color: "var(--text-primary)", fontFamily: "var(--font-sans)",
            width: 220,
          }}
        />
      ) : (
        <button onClick={() => { setNameVal(projectName); setEditingName(true); }} style={{
          background: "none", border: "none", cursor: "text", padding: "4px 6px",
          borderRadius: "var(--r-sm)",
          fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
          fontFamily: "var(--font-sans)", maxWidth: 240,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {projectName}
          {isDirty && <span style={{ color: "var(--text-muted)", marginLeft: 4, fontSize: 11 }}>•</span>}
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Undo / Redo */}
      <Btn title="Undo (⌘Z)">
        <Svg d={["M9 14L4 9l5-5", "M20 20v-7a4 4 0 00-4-4H4"]} />
      </Btn>
      <Btn title="Redo (⌘⇧Z)">
        <Svg d={["M15 14l5-5-5-5", "M4 20v-7a4 4 0 014-4h12"]} />
      </Btn>

      <div style={{ width: 1, height: 20, background: "var(--border)" }} />

      {/* Aspect ratio badge */}
      <div style={{
        padding: "3px 10px", borderRadius: "var(--r-full)",
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
        letterSpacing: "0.04em",
      }}>
        {aspectRatio}
      </div>

      {/* Live Export Status Badge */}
      {exporting && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 10px", borderRadius: "var(--r-md)",
          background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.35)",
        }}>
          <Spinner size="xs" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#C7D2FE", whiteSpace: "nowrap" }}>
              {exportStatusText || "Processing..."}
            </span>
            <div style={{ width: 120, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.max(3, exportProgress)}%`,
                background: "linear-gradient(90deg, #6366F1, #10B981)",
                transition: "width 0.25s ease",
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Export */}
      <Button
        variant="primary"
        size="sm"
        isLoading={exporting}
        leftIcon={<Icons.Download size={14} />}
        onClick={handleExport}
      >
        {exporting ? `${exportProgress}%` : "Export"}
      </Button>
    </header>
  );
}
