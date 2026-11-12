import { useEditorStore } from "@/store/editorStore";

export default function TranscribeTab() {
  const { scenes, activeSceneId, clips } = useEditorStore();
  const activeScene = scenes.find(s => s.id === activeSceneId) || scenes[0];
  const clip = activeScene ? clips.find(c => c.id === activeScene.clipId || c.src === activeScene.clipSrc || c.name === activeScene.label) : null;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Clip Transcript</div>
      
      {!activeScene ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          No scene selected.
        </div>
      ) : !clip ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          No source clip found for this scene.
        </div>
      ) : clip.transcriptionStatus === "pending" ? (
        <div style={{ fontSize: 12, color: "var(--accent)", textAlign: "center", marginTop: 20 }}>
          Transcribing audio...
        </div>
      ) : clip.transcriptionStatus === "failed" ? (
        <div style={{ fontSize: 12, color: "var(--error)", textAlign: "center", marginTop: 20 }}>
          Transcription failed for this clip.
        </div>
      ) : clip.transcriptionStatus === "completed_no_speech" ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          No speech detected in this clip.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {clip.speechSegments && clip.speechSegments.length > 0 ? (
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
             <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
               {clip.transcript || "No transcript available."}
             </div>
          )}
        </div>
      )}
    </div>
  );
}
