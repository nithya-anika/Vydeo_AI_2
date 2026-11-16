import { useEditorStore } from "@/store/editorStore";

export default function TranscribeTab() {
  const { scenes, activeSceneId, clips } = useEditorStore();
  const activeScene = scenes.find(s => s.id === activeSceneId) || scenes[0];
  
  // Try to find the clip.
  // 1. By exact ID
  // 2. By exact blob src URL
  // 3. By filename (ignoring extensions if needed, but exact is fine first)
  // Fallback: If scenes map straight to index, try to fallback roughly.
  let clip = activeScene ? clips.find(c => c.id === activeScene.clipId || c.src === activeScene.clipSrc || c.name === activeScene.label) : null;
  
  // Extra fallback: Extract base name without extension for fuzzier matching
  if (!clip && activeScene) {
    const activeLabelBase = activeScene.label ? activeScene.label.split('.')[0] : "";
    clip = clips.find(c => c.name.split('.')[0] === activeLabelBase) || null;
  }

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: 'flex', justifyContent: 'space-between' }}>
        <span>Clip Transcript</span>
        <button onClick={() => {
            console.log("DEBUG TRANSCRIBE TAB:", {
                activeScene,
                clip,
                allStoreClips: clips,
                clipHasSpeechSegments: clip?.speechSegments ? true : false,
                clipSpeechLen: clip?.speechSegments?.length,
                clipTranscript: clip?.transcript,
                clipStatus: clip?.transcriptionStatus
            });
            alert("Debug data logged to browser console! Checking console...");
        }} style={{ fontSize: 10, background: 'red', color: 'white', padding: '2px 6px', borderRadius: 4 }}>DEBUG</button>
      </div>
      
      {/* VISUAL DEBUG TOOL: REMOVE BEFORE PROD */}
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#ffb86c', background: '#282a36', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto' }}>
        {JSON.stringify({
           sceneId: activeScene?.id,
           foundClip: !!clip,
           clipName: clip?.name,
           hasSegments: !!clip?.speechSegments,
           segmentCount: clip?.speechSegments?.length,
           hasText: !!clip?.transcript,
           status: clip?.transcriptionStatus
        }, null, 2)}
      </div>
      
      {!activeScene ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          No scene selected.
        </div>
      ) : !clip ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          No source clip found for this scene.
        </div>
      ) : (clip.speechSegments && clip.speechSegments.length > 0) || clip.transcript ? (
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
               {clip.transcript}
             </div>
          )}
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
        <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", marginTop: 20 }}>
           No transcript available.
        </div>
      )}
    </div>
  );
}