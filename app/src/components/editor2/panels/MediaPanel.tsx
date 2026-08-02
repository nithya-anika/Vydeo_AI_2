'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Film, Scissors, HardDrive } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { Dropzone, Modal, EmptyState, Button, Input, useToast } from '@/components/ui'

export function MediaPanel() {
  const router = useRouter()
  const toast = useToast()
  const { clips, scenes, activeSceneId, addClip, assignClip, setActiveScene } = useEditorStore()
  const [showChoice, setShowChoice] = useState(false)
  const [driveUrl, setDriveUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null

  function ingest(files: File[]) {
    files.forEach((file) => {
      const src = URL.createObjectURL(file)
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(file.name)
      const id = crypto.randomUUID()
      const doAssign = () => {
        const empty = useEditorStore.getState().scenes.find((s) => !s.clipId)
        if (empty) { setActiveScene(empty.id); assignClip(id, empty.id) }
      }
      if (isVideo) {
        const vid = document.createElement('video')
        vid.preload = 'metadata'
        vid.onloadedmetadata = () => { addClip({ id, name: file.name, src, file, type: 'video', duration: vid.duration }); doAssign() }
        vid.onerror = () => { addClip({ id, name: file.name, src, file, type: 'video', duration: 5 }); doAssign() }
        vid.src = src
      } else {
        addClip({ id, name: file.name, src, file, type: 'image', duration: 4 })
        doAssign()
      }
    })
  }

  function onClipClick(clipId: string) {
    if (activeSceneId) assignClip(clipId, activeSceneId)
    else {
      const first = scenes.find((s) => !s.clipId)
      if (first) { setActiveScene(first.id); assignClip(clipId, first.id) }
    }
  }

  async function handleDriveImport() {
    if (!driveUrl) return;
    setImporting(true);
    toast.success("Google Drive import started. Connecting...");

    try {
      const res = await fetch("/api/import-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: driveUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to import files from Google Drive.");
      }

      const importedClips = data.clips ?? [];
      if (importedClips.length === 0) {
        toast.error("No valid video or image files were found in the Drive folder.");
        return;
      }

      // Add all imported clips to the store
      importedClips.forEach((clip: any) => {
        addClip(clip);
      });

      toast.success(`Successfully imported ${importedClips.length} files from Google Drive!`);
      setDriveUrl("");
    } catch (err: any) {
      console.error("[Drive Import]", err);
      toast.error(err.message ?? "Google Drive import failed. Please verify sharing permissions.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="tool-panel">
      <div className="tool-pad">
        <Dropzone onFiles={ingest} accept="video/*,image/*" title="Drop clips or click to upload" hint="Video or images — assigned to your scenes" />
        <Button variant="secondary" size="sm" fullWidth leftIcon={<Scissors size={13} />} style={{ marginTop: 8 }} onClick={() => setShowChoice(true)}>
          Edit raw footage with AI
        </Button>
      </div>

      <div className="tool-pad" style={{ paddingTop: 0, paddingBottom: 12 }}>
        <div style={{ padding: 12, background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <HardDrive size={14} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Import from Google Drive Folder</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Input 
              placeholder="Paste shared Drive folder link..." 
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              disabled={importing}
              style={{ flex: 1, height: 28, fontSize: 11, padding: "0 8px" }}
            />
            <Button 
              variant="primary" 
              size="sm" 
              onClick={handleDriveImport} 
              disabled={importing || !driveUrl}
              style={{ fontSize: 11, height: 28, padding: "0 10px" }}
            >
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            Ensure folder is shared: "Anyone with link can view"
          </div>
        </div>
      </div>

      <div className="tool-pad" style={{ paddingTop: 0 }}>
        <div className="tool-label">Clips ({clips.length})</div>
        {clips.length === 0 ? (
          <EmptyState icon={<Film size={20} />} title="No clips yet" description="Upload media or generate it from the AI panel." />
        ) : (
          <div className="clip-grid">
            {clips.map((clip) => (
              <button
                type="button"
                key={clip.id}
                className={`clip-thumb${activeScene?.clipId === clip.id ? ' is-assigned' : ''}`}
                onClick={() => onClipClick(clip.id)}
                title={clip.name}
              >
                {clip.type === 'video' ? <video src={clip.src} muted /> : <img src={clip.src} alt="" />}
                <span className="clip-thumb-name">{clip.name}</span>
                {activeScene?.clipId === clip.id && <span className="clip-thumb-dot" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showChoice}
        onClose={() => setShowChoice(false)}
        title="Edit raw footage with AI"
        description="Upload your footage and describe the edit — AI arranges, trims, and adds transitions."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowChoice(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => { setShowChoice(false); router.push('/footage') }}>Open Footage Editor</Button>
          </>
        }
      />
    </div>
  )
}
