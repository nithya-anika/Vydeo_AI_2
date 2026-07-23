"use client";

import { useState } from "react";
import Link from "next/link";
import { useEditorStore } from "@/store/editorStore";

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

export default function TopBar({ projectId }: { projectId?: string }) {
  const { projectName, isDirty, setProjectName, scenes, audioTracks, aspectRatio, clips } = useEditorStore();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(projectName);
  const [exporting, setExporting] = useState(false);

  const buildRenderScene = async (scene: any) => {
    const clip = scene.clipId ? clips.find((item) => item.id === scene.clipId) : null;
    let clipData: string | null = null;
    let clipMime = clip?.file?.type ?? "";
    let clipExt = clip?.file?.name?.split(".").pop()?.toLowerCase() ?? getExtensionFromUrl(scene.clipSrc ?? "") ?? "";

    if (clip?.file instanceof File && clip.file.size > 0) {
      clipData = await fileToDataUrl(clip.file);
      clipMime = clip.file.type || clipMime;
      clipExt = clipExt || (clip.file.name.split(".").pop()?.toLowerCase() ?? "");
    } else if (clip?.file instanceof File && clip.file.size === 0) {
      if (scene.clipSrc) {
        console.warn(
          `[Export] Skipping empty placeholder file for scene "${scene.label}" and falling back to clipSrc.`
        );
      } else {
        console.warn(
          `[Export] Scene "${scene.label}" has no media because the attached file is empty and no clipSrc fallback is available; rendering will use a placeholder frame.`
        );
        clipData = null;
      }
    }

    if (!clipData && scene.clipSrc) {
      if (String(scene.clipSrc).startsWith("http://") || String(scene.clipSrc).startsWith("https://") || String(scene.clipSrc).startsWith("gs://")) {
        console.log(
          `[Export] Remote media URL found — skipping browser download, server will fetch directly for scene "${scene.label}".`
        );
        // Keep clipData null so the payload stays light, server will fetch it!
      } else {
        let response = null;
        try {
          response = await fetch(scene.clipSrc);
        } catch (err) {
          console.warn(
            `[Export] Network error fetching clip for scene "${scene.label}":`, err
          );
        }
        if (!response || !response.ok) {
          console.warn(
            `[Export] Could not fetch clip for scene "${scene.label}"; rendering will use a placeholder frame.`
          );
          clipData = null;
        } else {
          const blob = await response.blob();
          if (blob.size === 0) {
            console.warn(
              `[Export] Scene "${scene.label}" returned an empty media file; rendering will use a placeholder frame.`
            );
            clipData = null;
          } else {
            clipMime = blob.type || clipMime;
            clipExt = clipExt || getExtensionFromUrl(scene.clipSrc) ?? "";
            clipData = await blobToDataUrl(blob);
          }
        }
      }
    }

    if (clipData) {
      const commaIndex = clipData.indexOf(",");
      const header = commaIndex >= 0 ? clipData.slice(0, commaIndex) : "";
      const base64 = commaIndex >= 0 ? clipData.slice(commaIndex + 1) : "";

      if (!header.includes(";base64") || !base64.trim()) {
        console.warn(
          `[Export] Scene "${scene.label}" contains an empty media file; rendering will use a placeholder frame.`
        );
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
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(text));
      await writer.close();

      const chunks: Uint8Array[] = [];
      const reader = stream.readable.getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value ?? new Uint8Array());
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const buffer = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      let binary = "";
      const len = buffer.byteLength;
      for (let i = 0; i < len; i += 65536) {
        binary += String.fromCharCode(...buffer.subarray(i, i + 65536));
      }

      return btoa(binary);
    } catch {
      return null;
    }
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const payloadScenes = await Promise.all(scenes.map(buildRenderScene));

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
          audioPayload = {
            src: audioData,
            volume: activeAudio.volume ?? 0.7,
            fadeIn: activeAudio.fadeIn ?? 0.5,
            fadeOut: activeAudio.fadeOut ?? 1.0,
          };
        }
      }

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

      const estimatedPayloadBytes = new Blob([requestBody]).size;
      const MAX_EXPORT_PAYLOAD_BYTES = isLocalhost ? 1_000_000_000 : 4_500_000; // 1 GB on localhost, 4.5 MB on cloud

      if (estimatedPayloadBytes > MAX_EXPORT_PAYLOAD_BYTES) {
        throw new Error(
          "Export payload is too large for this environment. Please reduce the number of clips or shorten the project before exporting."
        );
      }

      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        console.error("Export failed", errorBody);
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
      if (data.downloadUrl) {
        const a = document.createElement("a");
        a.href = data.downloadUrl; a.download = data.filename ?? "export.mp4";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    } finally {
      setExporting(false);
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

      {/* Export */}
      <Btn variant="primary" onClick={handleExport} style={{ gap: 6 }}>
        {exporting ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ animation: "spin 1s linear infinite" }}>
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            Exporting…
          </>
        ) : (
          <>
            <Svg d={["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"]} />
            Export
          </>
        )}
      </Btn>
    </header>
  );
}
