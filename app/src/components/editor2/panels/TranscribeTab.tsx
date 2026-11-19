import { useEditorStore } from "@/store/editorStore";

export default function TranscribeTab() {
  const { scenes, activeSceneId, clips } = useEditorStore();
  const activeScene = scenes.find(s => s.id === activeSceneId) || scenes[0];
  
  let clip = activeScene ? clips.find(c => c.id === activeScene.clipId || c.src === activeScene.clipSrc || c.name === activeScene.label) : null;
  
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
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Clip Transcript</div>
      
      {!activeScene ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          No scene selected.
        </div>
      ) : !clip ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          No source clip found for this scene.
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
          No speech detected in this clip. <br/><br/>
          <span style={{ fontSize: 10, opacity: 0.7 }}>The AI could not hear clear dialogue. If there is speech, the audio may be too quiet or distorted for the AI to recognize.</span>
        </div>
      )}
    </div>
  );
}