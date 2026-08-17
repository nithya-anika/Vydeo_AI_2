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

    // --- VERCEL PAYLOAD BYPASS (Direct GCS Upload) ---
    // Instead of base64 converting massive files (which crashes V8 with 'Invalid string length'),
    // we take the rawBlob, upload it securely to S3/GCS, and pass the URL forward.
    if (rawMediaBlob) {
      if (rawMediaBlob.size > 100_000) {
        console.log(`[Export] Media detected for scene "${scene.label}" (${(rawMediaBlob.size / 1024 / 1024).toFixed(2)} MB). Direct uploading to cloud storage...`);
        try {
          const uploadInitRes = await fetch("/api/upload-media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: `scene_${scene.id}.${clipExt}`, contentType: clipMime }),
          });
          
          if (uploadInitRes.ok) {
            const initData = await uploadInitRes.json();
            const { url, gcsPath, token, isS3, publicUrl } = initData;

            let uploadRes;
            if (isS3) {
              uploadRes = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": clipMime },
                body: rawMediaBlob,
              });
            } else {
              uploadRes = await fetch(url, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": clipMime, "Content-Length": String(rawMediaBlob.size) },
                body: rawMediaBlob,
              });
            }

            if (uploadRes.ok) {
              if (isS3) {
                scene.clipSrc = publicUrl;
              } else {
                scene.clipSrc = `gs://${gcsPath}`;
              }
              // We successfully uploaded it, no need to inject clipData into the JSON payload
              rawMediaBlob = null; 
            } else {
              console.warn(`[Export] Direct upload failed with status ${uploadRes.status}`);
            }
          }
        } catch (err) {
          console.warn(`[Export] Direct upload crashed for scene "${scene.label}".`, err);
        }
      }

      // If the file was tiny (< 100KB) OR the cloud upload failed, 
      // fallback to sending it as an inline base64 string
      if (rawMediaBlob) {
        clipData = await blobToDataUrl(rawMediaBlob);
      }
    }

    if (clipData) {
      const commaIndex = clipData.indexOf(",");
      const header = commaIndex >= 0 ? clipData.slice(0, commaIndex) : "";
      const base64 = commaIndex >= 0 ? clipData.slice(commaIndex + 1) : "";

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
          if (audioData.startsWith("data:")) {
            console.log(`[Export] Local audio detected (${(audioData.length / 1024 / 1024).toFixed(2)} MB). Bypassing audio payload via direct upload...`);
            try {
              const b64Data = audioData.split(",")[1];
              const byteCharacters = atob(b64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const uploadBlob = new Blob([byteArray], { type: "audio/mpeg" });

              const uploadInitRes = await fetch("/api/upload-media", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: `audio_${activeAudio.id || crypto.randomUUID()}.mp3`, contentType: "audio/mpeg" }),
              });

              if (uploadInitRes.ok) {
                const initData = await uploadInitRes.json();
                const { url, gcsPath, token, isS3, publicUrl } = initData;

                let uploadRes;
                if (isS3) {
                  uploadRes = await fetch(url, {
                    method: "PUT",
                    headers: { "Content-Type": "audio/mpeg" },
                    body: uploadBlob,
                  });
                } else {
                  uploadRes = await fetch(url, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "audio/mpeg", "Content-Length": String(uploadBlob.size) },
                    body: uploadBlob,
                  });
                }

                if (uploadRes.ok) {
                  if (isS3) {
                    console.log(`[Export] Direct S3 (Storj) audio upload successful: ${publicUrl}`);
                    audioData = publicUrl;
                  } else {
                    console.log(`[Export] Direct GCS audio upload successful: gs://${gcsPath}`);
                    audioData = `gs://${gcsPath}`;
                  }
                } else {
                  console.warn(`[Export] Direct audio upload failed with status ${uploadRes.status}`);
                }
              } else {
                console.warn(`[Export] Direct audio upload init failed`);
              }
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
      
      let finalDownloadUrl = data.downloadUrl;

      // Handle async AWS Lambda rendering polling
      if (!finalDownloadUrl && data.renderId && data.bucketName) {
        console.log(`[Export] Serverless render initiated. Polling AWS Lambda (ID: ${data.renderId})...`);
        let done = false;
        
        while (!done) {
          await new Promise(r => setTimeout(r, 4000));
          try {
            const statusRes = await fetch(`/api/render/status?renderId=${data.renderId}&bucketName=${data.bucketName}`);
            const statusData = await statusRes.json();
            
            if (!statusRes.ok || statusData.error) {
              console.error("[Export] AWS Lambda rendering failed:", statusData.error);
              return;
            }
            
            if (statusData.done && statusData.downloadUrl) {
              finalDownloadUrl = statusData.downloadUrl;
              done = true;
            } else {
              console.log(`[Export] Rendering progress: ${statusData.progress}%`);
            }
          } catch (pollErr) {
            console.error("[Export] Polling error:", pollErr);
          }
        }
      }

      if (finalDownloadUrl) {
        console.log(`[Export] Ready for download! ${finalDownloadUrl}`);
        // Create an explicit anchor element to force download
        const a = document.createElement("a");
        a.href = finalDownloadUrl; 
        a.download = data.filename ?? "export.mp4";
        a.target = "_blank"; // Ensure it opens in a new tab if it can't force download
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a);
      } else {
         console.warn("[Export] Process finished but no downloadUrl was returned.");
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
