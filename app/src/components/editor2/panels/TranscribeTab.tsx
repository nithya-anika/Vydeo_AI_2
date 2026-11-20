import { useEditorStore } from "@/store/editorStore";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

export default function TranscribeTab() {
  const { scenes, activeSceneId, clips, updateClip } = useEditorStore();
  const activeScene = scenes.find(s => s.id === activeSceneId) || scenes[0];
  
  let clip = activeScene ? clips.find(c => c.id === activeScene.clipId || c.src === activeScene.clipSrc || c.name === activeScene.label) : null;
  
  const [isTranscribing, setIsTranscribing] = useState(false);

  async function forceTranscribeFallback(src: string, label: string, sceneId: string, duration: number) {
    setIsTranscribing(true);
    try {
       const fetchRes = await fetch(src);
       const blob = await fetchRes.blob();
       const file = new File([blob], label + ".mp4", { type: blob.type || "video/mp4" });
       
       const formData = new FormData();
       formData.append("file", file);
       formData.append("duration", String(duration));
       
       const apiRes = await fetch("/api/transcribe-clip", { method: "POST", body: formData });
       if (!apiRes.ok) throw new Error("Transcription failed");
       
       const data = await apiRes.json();
       updateClip(sceneId, {
          speechSegments: data.captions || [],
          transcript: data.fullTranscript || "",
          transcriptionStatus: data.captions?.length ? "completed_with_speech" : "completed_no_speech"
       });
       
       toast.success("Transcription complete!");
    } catch (e) {
       console.error(e);
       toast.error("Failed to transcribe video.");
    } finally {
       setIsTranscribing(false);
    }
  }

  async function forceTranscribe() {
    if (!clip || !clip.src) {
       toast.error("Cannot find source video file.");
       return;
    }
    
    setIsTranscribing(true);
    try {
       // Since the clip is already in the editor, we don't have the original 'File' object (it's dropped to save RAM).
       // We must fetch it from the local server proxy stream first, turn it into a blob, then hit the API.
       const fetchRes = await fetch(clip.src);
       const blob = await fetchRes.blob();
       const file = new File([blob], clip.name + ".mp4", { type: blob.type || "video/mp4" });
       
       const formData = new FormData();
       formData.append("file", file);
       formData.append("duration", String(clip.duration));
       
       const apiRes = await fetch("/api/transcribe-clip", { method: "POST", body: formData });
       if (!apiRes.ok) throw new Error("Transcription failed");
       
       const data = await apiRes.json();
       updateClip(clip.id, {
          speechSegments: data.captions || [],
          transcript: data.fullTranscript || "",
          transcriptionStatus: data.captions?.length ? "completed_with_speech" : "completed_no_speech"
       });
       
       toast.success("Transcription complete!");
    } catch (e) {
       console.error(e);
       toast.error("Failed to transcribe video.");
    } finally {
       setIsTranscribing(false);
    }
  }
  
  if (!clip && activeScene) {
    const activeLabelBase = activeScene.label ? activeScene.label.split('.')[0].replace(/\s/g, '') : "";
    clip = clips.find(c => c.name.split('.')[0].replace(/\s/g, '') === activeLabelBase) || null;
  }
  
  if (!clip && activeScene && clips.length > 0) {
     const sceneIdx = scenes.findIndex(s => s.id === activeScene.id);
     if (sceneIdx !== -1 && sceneIdx < clips.length) {
         clip = clips[sceneIdx % clips.length];
     }
  }
  
  if (!clip && activeScene?.clipId && activeScene.clipId.match(/^\d+$/)) {
      const idx = parseInt(activeScene.clipId);
      if (idx >= 0 && idx < clips.length) {
          clip = clips[idx];
      }
  }

  const hasSegments = clip && clip.speechSegments && clip.speechSegments.length > 0;
  const hasText = clip && !!clip.transcript;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Clip Transcript</span>
        <Button onClick={() => {
            if (!activeScene) { toast.error("Please click a clip on the timeline first!"); return; }
            if (!clip) forceTranscribeFallback(activeScene.clipSrc, activeScene.label, activeScene.id, activeScene.duration);
            else forceTranscribe();
        }} disabled={isTranscribing} variant="secondary" size="sm" style={{ height: 24, fontSize: 10 }}>
           {isTranscribing ? "Wait..." : "Force Transcribe"}
        </Button>
      </div>
      
      {!activeScene ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          No scene selected.
        </div>
      ) : !clip ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          <Button onClick={() => {
              if (!activeScene.clipSrc) { toast.error("No source URL attached to this scene."); return; }
              // Force create a pseudo-clip and fetch it.
              updateClip(activeScene.id, { 
                  id: activeScene.id, name: activeScene.label, src: activeScene.clipSrc, type: "video", duration: activeScene.duration,
                  speechSegments: [], transcript: "", transcriptionStatus: "pending" 
              });
              forceTranscribeFallback(activeScene.clipSrc, activeScene.label, activeScene.id, activeScene.duration);
          }} disabled={isTranscribing} variant="secondary" size="sm" style={{ width: "100%", marginBottom: "16px" }}>
             {isTranscribing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Transcribing...</> : "Manually Transcribe Scene"}
          </Button>
          No source clip found for this scene.
          <br/><br/>
          <div style={{ fontSize: 10, textAlign: "left", opacity: 0.8, wordBreak: "break-all" }}>
             <strong>DEBUG INFO:</strong><br/>
             Active Scene Label: {activeScene.label}<br/>
             Active Scene Src: {activeScene.clipSrc}<br/>
             Active Scene ID: {activeScene.clipId}<br/>
             Total Store Clips: {clips.length}
          </div>
        </div>
      ) : hasSegments || hasText ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {hasSegments ? (
            clip.speechSegments.map((seg, i) => (
              <div key={i} style={{ 
                background: "var(--bg-elevated)", 
                border: "1px solid var(--border)", 
                padding: "10px 12px", 
                borderRadius: "var(--r-md)",
                display: "flex", flexDirection: "column", gap: 6
              }}>
                <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>
                  {seg.startTime.toFixed(1)}s - {seg.endTime.toFixed(1)}s
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  "{seg.text}"
                </div>
              </div>
            ))
          ) : (
             <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
               {clip.transcript}
             </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20, padding: "0 10px" }}>
          <Button onClick={forceTranscribe} disabled={isTranscribing} variant="secondary" size="sm" style={{ width: "100%", marginBottom: "16px" }}>
             {isTranscribing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Transcribing...</> : "Manually Transcribe"}
          </Button>
          No speech detected in cache. <br/><br/>
          <span style={{ fontSize: 10, opacity: 0.7 }}>If this clip has speech, click the button above to manually run the AI transcription agent.</span>
        </div>
      )}
    </div>
  );
}