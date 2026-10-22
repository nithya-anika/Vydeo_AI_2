'use client'

import { useState, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Upload, Volume2, VolumeX, Trash2, Play, Pause, Plus } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { Slider, IconButton } from '@/components/ui'
import { MUSIC_TRACKS, MUSIC_GENRES, ENERGY_TOKEN, type MusicTrackMeta } from '../data'

export function MusicPanel() {
  const { audioTracks, updateAudioTrack, removeAudioTrack, addAudioTrack } = useEditorStore()
  const [genre, setGenre] = useState('All')
  const [previewing, setPreviewing] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  const tracks = MUSIC_TRACKS.filter((t) => genre === 'All' || t.genre === genre)

  function stopPreview() {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current.src = ''
      previewAudioRef.current = null
    }
  }
  useEffect(() => () => stopPreview(), [])

  function preview(t: MusicTrackMeta) {
    if (previewing === t.name) { stopPreview(); setPreviewing(null); return }
    stopPreview()
    setPreviewing(t.name)
    if (t.src) {
      const a = new Audio(t.src)
      a.volume = 0.7
      a.onended = () => { setPreviewing(null); previewAudioRef.current = null }
      a.onerror = () => { setPreviewing(null); previewAudioRef.current = null }
      a.play().catch(() => { setPreviewing(null); previewAudioRef.current = null })
      previewAudioRef.current = a
    } else {
      setPreviewing(null)
    }
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const src = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => addAudioTrack({
      id: uuidv4(), name: file.name.replace(/\.[^.]+$/, ''), src, file,
      duration: audio.duration, volume: 0.8, fadeIn: 0.5, fadeOut: 0.5, startTime: 0, muted: false, type: 'bgm',
    })
    audio.src = src
    e.target.value = ''
  }

  function addLibraryTrack(t: MusicTrackMeta) {
    stopPreview()
    const trackSrc = t.src || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
    const trackDur = t.duration || 120
    addAudioTrack({
      id: uuidv4(), name: t.name, src: trackSrc, file: null as unknown as File,
      duration: trackDur, volume: 0.8, fadeIn: 0.5, fadeOut: 1.0, startTime: 0, muted: false, type: 'bgm',
    })
    setPreviewing(null)
  }

  return (
    <div className="tool-panel">
      <div className="tool-pad">
        <input ref={uploadRef} type="file" accept="audio/*" hidden onChange={onUpload} />
        <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', borderStyle: 'dashed' }} onClick={() => uploadRef.current?.click()}>
          <Upload size={13} /> Upload track
        </button>
      </div>

      {audioTracks.length > 0 && (
        <div className="tool-pad" style={{ paddingTop: 0 }}>
          <div className="tool-label">My tracks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {audioTracks.map((t) => (
              <div key={t.id} className="track-card is-mine">
                <div className="track-row">
                  <IconButton label={t.muted ? 'Unmute' : 'Mute'} variant="ghost" size="sm" onClick={() => updateAudioTrack(t.id, { muted: !t.muted })}>
                    {t.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </IconButton>
                  <div className="grow-min">
                    <div className="track-name">{t.name}</div>
                    <div className="track-sub">{Math.round(t.duration)}s</div>
                  </div>
                  <IconButton label="Remove track" variant="ghost" size="sm" onClick={() => removeAudioTrack(t.id)}>
                    <Trash2 size={12} />
                  </IconButton>
                </div>
                <div style={{ padding: '0 10px 8px' }}>
                  <Slider min={0} max={1} step={0.01} value={t.volume ?? 0.8} showValue formatValue={(v) => `${Math.round(v * 100)}%`}
                    aria-label="Volume" onChange={(e) => updateAudioTrack(t.id, { volume: parseFloat(e.target.value) })} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tool-divider" />

      <div className="tool-pad" style={{ paddingTop: 0 }}>
        <div className="flex-between" style={{ marginBottom: 8 }}>
          <div className="tool-label" style={{ marginBottom: 0 }}>Royalty-free library</div>
          <span className="tool-note">{tracks.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {MUSIC_GENRES.map((g) => (
            <button key={g} type="button" className={`chip${genre === g ? ' is-active' : ''}`} onClick={() => setGenre(g)}>{g}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tracks.map((t) => (
            <div key={t.name} className={`track-card${previewing === t.name ? ' is-previewing' : ''}`}>
              <div className="track-row">
                <IconButton label={previewing === t.name ? 'Stop preview' : 'Preview'} variant={previewing === t.name ? 'primary' : 'secondary'} size="sm" round onClick={() => preview(t)}>
                  {previewing === t.name ? <Pause size={11} /> : <Play size={11} />}
                </IconButton>
                <div className="grow-min">
                  <div className="track-name">{t.name}</div>
                  <div className="track-sub">
                    <span>{t.genre}</span><span className="track-dot" />
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{t.bpm} BPM</span><span className="track-dot" />
                    <span style={{ fontWeight: 700, color: ENERGY_TOKEN[t.energy] }}>{t.energy}</span>
                  </div>
                </div>
                <IconButton label="Add to timeline" variant="outline" size="sm" onClick={() => addLibraryTrack(t)}>
                  <Plus size={11} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
