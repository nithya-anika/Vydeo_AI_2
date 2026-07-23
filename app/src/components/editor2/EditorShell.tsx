"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Play,
  Pause,
  Undo2,
  Redo2,
  Download,
  Film,
  Type,
  Music,
  Layers,
  Palette,
  Sparkles,
  Wand2,
  ArrowRight,
  Upload,
  Plus,
  Trash2,
  ZoomIn,
  Volume2,
  VolumeX,
  Sliders,
  Scissors,
} from "lucide-react";
import {
  useEditorStore,
  type LeftTab,
  type Mood,
  type AspectRatio,
  type TransitionType,
  type Scene,
  type Caption,
} from "@/store/editorStore";
import TimelinePanel from "./timeline/TimelinePanel";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { buildSceneVideoPrompt } from "@/lib/videoPrompt";
import { inferRequestedColorAdjustments, inferRequestedColorGrade, inferRequestedTransition } from "@/lib/footagePromptControls";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

async function srcToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) {
    return src;
  }

  const response = await fetch(src);

  if (!response.ok) {
    throw new Error(`Could not read media for export (${response.status})`);
  }

  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not convert media to data URL."));
      }
    };

    reader.onerror = () => {
      reject(new Error("Could not convert media to data URL."));
    };

    reader.readAsDataURL(blob);
  });
}

const PENDING_EDITOR_HANDOFF_KEYS = [
  "vydeoai_pending_video_gen",
  "vydeoai_pending_clip_assign",
  "vydeoai_pending_footage_editor",
] as const;

const FOOTAGE_TRANSITIONS = new Set<TransitionType>([
  "cut", "fade", "dissolve", "wipe-left", "wipe-right", "zoom-in", "zoom-out",
  "cross-zoom", "slide-left", "slide-right", "cinematic-fade", "glitch",
  "blur", "whip", "light-leak", "flash",
]);

async function playMediaElement(el: HTMLMediaElement, options: { allowMutedFallback?: boolean } = {}) {
  try {
    await el.play();
    return true;
  } catch {
    if (options.allowMutedFallback && !el.muted) {
      el.muted = true;
      try {
        await el.play();
        return true;
      } catch {
        /* keep the preview paused if playback is still blocked */
    }
  }
  return false;
}
}

function VDivider() {
  return (
    <div
      style={{
        width: 1,
        height: 20,
        background: "var(--border)",
        flexShrink: 0,
        alignSelf: "center",
      }}
    />
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active = false,
  size = 28,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  size?: number;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const bg = active
    ? "var(--accent-subtle)"
    : hover
    ? "var(--bg-hover)"
    : "transparent";
  const color = active
    ? "var(--accent-light)"
    : hover
    ? "var(--text-primary)"
    : "var(--text-secondary)";
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--r-md)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        border: active ? "1px solid var(--accent-border)" : "none",
        cursor: disabled ? "not-allowed" : "pointer",
        color,
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.12s, color 0.12s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ─── Left Panel Tab Content ──────────────────────────────────────────────────

const LEFT_TABS: { id: LeftTab; label: string; Icon: React.ElementType }[] = [
  { id: "media", label: "Media", Icon: Film },
  { id: "text", label: "Text", Icon: Type },
  { id: "music", label: "Music", Icon: Music },
  { id: "transitions", label: "Trans", Icon: Layers },
  { id: "brand", label: "Brand", Icon: Palette },
  { id: "ai", label: "AI", Icon: Sparkles },
  { id: "effects", label: "FX", Icon: Wand2 },
];

const MUSIC_TRACKS = [
  { name: "Cinematic Rise", dur: "2:34", duration: 154, genre: "Cinematic", bpm: 92, energy: "High", mood: "Epic", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { name: "Deep Focus", dur: "3:12", duration: 192, genre: "Ambient", bpm: 72, energy: "Low", mood: "Calm", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { name: "Upbeat Drive", dur: "1:58", duration: 118, genre: "Pop", bpm: 128, energy: "High", mood: "Energetic", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { name: "Lo-Fi Chill", dur: "4:01", duration: 241, genre: "Lo-Fi", bpm: 85, energy: "Low", mood: "Relaxed", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
  { name: "Epic Trailer", dur: "2:20", duration: 140, genre: "Cinematic", bpm: 110, energy: "High", mood: "Intense", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
  { name: "Luxury Brand", dur: "1:45", duration: 105, genre: "Ambient", bpm: 60, energy: "Low", mood: "Premium", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
  { name: "Tech Corporate", dur: "2:10", duration: 130, genre: "Electronic", bpm: 120, energy: "Medium", mood: "Professional", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3" },
  { name: "Summer Vibes", dur: "2:55", duration: 175, genre: "Pop", bpm: 115, energy: "High", mood: "Happy", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3" },
  { name: "Dark Minimal", dur: "3:30", duration: 210, genre: "Electronic", bpm: 95, energy: "Medium", mood: "Mysterious", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3" },
  { name: "Acoustic Warm", dur: "2:48", duration: 168, genre: "Acoustic", bpm: 80, energy: "Low", mood: "Friendly", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3" },
];

const TRANSITIONS_LIST = [
  { name: "Cut", id: "cut", icon: "✂" },
  { name: "Fade", id: "fade", icon: "◑" },
  { name: "Dissolve", id: "dissolve", icon: "∿" },
  { name: "Zoom In", id: "zoom-in", icon: "⊕" },
  { name: "Zoom Out", id: "zoom-out", icon: "⊖" },
  { name: "Cross Zoom", id: "cross-zoom", icon: "⌾" },
  { name: "Slide Left", id: "slide-left", icon: "←" },
  { name: "Slide Right", id: "slide-right", icon: "→" },
  { name: "Wipe Left", id: "wipe-left", icon: "◁" },
  { name: "Wipe Right", id: "wipe-right", icon: "▷" },
  { name: "Cinematic Fade", id: "cinematic-fade", icon: "◐" },
  { name: "Glitch", id: "glitch", icon: "⚡" },
  { name: "Whip", id: "whip", icon: "↔" },
  { name: "Light Leak", id: "light-leak", icon: "☀" },
  { name: "Blur", id: "blur", icon: "◎" },
  { name: "Flash", id: "flash", icon: "✦" },
];

const EFFECTS_LIST = [
  "Cinematic Grade",
  "Vintage Film",
  "Teal & Orange",
  "Black & White",
  "Warm Sunset",
  "Cool Mist",
  "Neon Glow",
  "Desaturated",
];

const AI_ACTIONS = [
  { label: "Generate caption for scene", icon: "✦", action: "captions" },
  { label: "Improve pacing (4s per scene)", icon: "⟳", action: "pacing" },
  { label: "Apply cinematic grade", icon: "◈", action: "colorgrade" },
  { label: "Add cinematic fade transitions", icon: "⊕", action: "transitions" },
];

const TEXT_PRESETS = [
  { name: "Title", size: 48, weight: "bold" },
  { name: "Subtitle", size: 32, weight: "600" },
  { name: "Caption", size: 20, weight: "normal" },
  { name: "Lower Third", size: 18, weight: "500" },
];

const effectGradients: Record<string, string> = {
  "Warm Sunset": "linear-gradient(135deg,#F59E0B,#EF4444)",
  "Cool Mist": "linear-gradient(135deg,#3B82F6,#8B5CF6)",
  "Neon Glow": "linear-gradient(135deg,#10B981,#6366F1)",
  "Black & White": "linear-gradient(135deg,#111,#444)",
  "Teal & Orange": "linear-gradient(135deg,#14B8A6,#F97316)",
  "Vintage Film": "linear-gradient(135deg,#92400E,#D97706)",
  Desaturated: "linear-gradient(135deg,#6B7280,#9CA3AF)",
};

// ─── CSS filter builder for color adjustments + LUT grades ───────────────────

function buildCSSFilter(
  adj: { exposure: number; contrast: number; saturation: number; temperature: number; highlights: number; shadows: number; tint: number } | undefined,
  grade: string | null
): string {
  const a = adj ?? { exposure: 0, contrast: 0, saturation: 0, temperature: 0, highlights: 0, shadows: 0, tint: 0 };
  const parts: string[] = [];

  const brightness = 1 + a.exposure; // exposure: 0.2 = +20%, 0.5 = +50%
  if (Math.abs(brightness - 1) > 0.005) parts.push(`brightness(${brightness.toFixed(3)})`);

  const contrast = 1 + a.contrast / 100;
  if (Math.abs(contrast - 1) > 0.005) parts.push(`contrast(${contrast.toFixed(3)})`);

  const saturate = 1 + a.saturation / 100;
  if (Math.abs(saturate - 1) > 0.005) parts.push(`saturate(${saturate.toFixed(3)})`);

  // Temperature: warm (positive) = slight sepia/orange, cool (negative) = hue-rotate blue
  const hue = -a.temperature * 0.35;
  if (Math.abs(hue) > 0.5) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);

  switch (grade) {
    case "Black & White":    parts.push("grayscale(1)"); break;
    case "Vintage Film":     parts.push("sepia(0.45) contrast(1.1) brightness(0.88)"); break;
    case "Warm Sunset":      parts.push("saturate(1.4) sepia(0.15) brightness(1.06)"); break;
    case "Cool Mist":        parts.push("saturate(0.75) hue-rotate(18deg) brightness(1.08)"); break;
    case "Neon Glow":        parts.push("saturate(2) brightness(1.12) contrast(1.2)"); break;
    case "Teal & Orange":    parts.push("saturate(1.5) hue-rotate(-14deg) contrast(1.08)"); break;
    case "Desaturated":      parts.push("saturate(0.18) contrast(1.05)"); break;
    case "Cinematic Grade":  parts.push("contrast(1.12) saturate(0.82) brightness(0.88)"); break;
  }

  return parts.length ? parts.join(" ") : "none";
}

// ─── Music Studio ────────────────────────────────────────────────────────────

const MUSIC_GENRES = ["All", "Cinematic", "Ambient", "Pop", "Electronic", "Lo-Fi", "Acoustic"];
const ENERGY_COLORS: Record<string, string> = { Low: "#10B981", Medium: "#F59E0B", High: "#EF4444" };

function MusicStudio({
  panelStyle,
  musicInputRef,
  onMusicUpload,
}: {
  panelStyle: React.CSSProperties;
  musicInputRef: React.RefObject<HTMLInputElement | null>;
  onMusicUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const { audioTracks, updateAudioTrack, removeAudioTrack, addAudioTrack } = useEditorStore();
  const [genreFilter, setGenreFilter] = useState("All");
  const [previewingTrack, setPreviewingTrack] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredTracks = MUSIC_TRACKS.filter(
    (t) => genreFilter === "All" || t.genre === genreFilter
  );

  function stopPreviewAudio() {
    if (beatTimerRef.current) clearTimeout(beatTimerRef.current);
    beatTimerRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }

  function handlePreview(trackName: string, bpm: number, energy: string) {
    if (previewingTrack === trackName) {
      stopPreviewAudio();
      setPreviewingTrack(null);
      return;
    }
    stopPreviewAudio();
    setPreviewingTrack(trackName);

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const beatInterval = 60 / bpm;
      const freq = energy === "High" ? 880 : energy === "Medium" ? 660 : 440;
      let nextBeat = ctx.currentTime + 0.05;

      function scheduleBeat() {
        if (!audioCtxRef.current || ctx.state === "closed") return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, nextBeat);
        gain.gain.setValueAtTime(0.08, nextBeat);
        gain.gain.exponentialRampToValueAtTime(0.001, nextBeat + 0.06);
        osc.start(nextBeat);
        osc.stop(nextBeat + 0.06);
        nextBeat += beatInterval;
        const delayMs = Math.max(10, (nextBeat - ctx.currentTime - 0.3) * 1000);
        beatTimerRef.current = setTimeout(scheduleBeat, delayMs);
      }
      scheduleBeat();
    } catch {
      setPreviewingTrack(null);
    }
  }

  // Cleanup on unmount
  useEffect(() => () => stopPreviewAudio(), []);


  function handleAddToTimeline(t: typeof MUSIC_TRACKS[0]) {
    addAudioTrack({
      id: crypto.randomUUID(),
      name: t.name,
      src: t.src,
      file: new File([], `${t.name}.mp3`, { type: "audio/mpeg" }),
      duration: t.duration,
      volume: 0.8,
      fadeIn: 0.5,
      fadeOut: 1.0,
      startTime: 0,
      muted: false,
      type: "bgm",
    });
    setPreviewingTrack(null);
  }

  return (
    <div style={panelStyle}>
      <input ref={musicInputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={onMusicUpload} />

      {/* Upload button */}
      <div style={{ padding: "10px 12px 6px" }}>
        <button
          onClick={() => musicInputRef.current?.click()}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: "var(--r-md)",
            background: "var(--bg-elevated)", border: "1px dashed var(--border-strong)",
            color: "var(--text-secondary)", fontSize: 11, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
          }}
        >
          <Upload size={12} /> Upload Track
        </button>
      </div>

      {/* My Tracks */}
      {audioTracks.length > 0 && (
        <div style={{ padding: "0 12px 8px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>
            My Tracks
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {audioTracks.map((t) => (
              <div key={t.id} style={{ borderRadius: "var(--r-md)", background: "var(--bg-elevated)", border: "1px solid var(--accent-border)", overflow: "hidden" }}>
                {/* Track row */}
                <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => updateAudioTrack(t.id, { muted: !t.muted })}
                    style={{ background: "none", border: "none", cursor: "pointer", color: t.muted ? "#EF4444" : "#10B981", padding: 0, flexShrink: 0 }}
                  >
                    {t.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>{Math.round(t.duration)}s</div>
                  </div>
                  <button
                    onClick={() => removeAudioTrack(t.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0, flexShrink: 0 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                {/* Volume slider */}
                <div style={{ padding: "0 10px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Sliders size={10} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                  <input
                    type="range" min={0} max={1} step={0.01} value={t.volume ?? 0.8}
                    onChange={(e) => updateAudioTrack(t.id, { volume: parseFloat(e.target.value) })}
                    style={{ flex: 1, accentColor: "#10B981", height: 3, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", minWidth: 28 }}>
                    {Math.round((t.volume ?? 0.8) * 100)}%
                  </span>
                </div>
                {/* Fade controls */}
                <div style={{ padding: "0 10px 8px", display: "flex", gap: 6 }}>
                  {(["fadeIn", "fadeOut"] as const).map((key) => (
                    <div key={key} style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 3 }}>{key === "fadeIn" ? "Fade In" : "Fade Out"}</div>
                      <input
                        type="range" min={0} max={3} step={0.1} value={t[key] ?? 0.5}
                        onChange={(e) => updateAudioTrack(t.id, { [key]: parseFloat(e.target.value) })}
                        style={{ width: "100%", accentColor: "#10B981", height: 3, cursor: "pointer" }}
                      />
                      <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{(t[key] ?? 0.5).toFixed(1)}s</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)", margin: "0 12px 8px" }} />

      {/* Library header */}
      <div style={{ padding: "0 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
          Royalty-Free Library
        </div>
        <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{filteredTracks.length} tracks</span>
      </div>

      {/* Genre filter */}
      <div style={{ padding: "0 12px 8px", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {MUSIC_GENRES.map((g) => (
          <button
            key={g}
            onClick={() => setGenreFilter(g)}
            style={{
              fontSize: 9, fontWeight: 600, padding: "3px 7px",
              borderRadius: "var(--r-full)", border: "1px solid var(--border)",
              background: genreFilter === g ? "var(--accent-subtle)" : "var(--bg-elevated)",
              color: genreFilter === g ? "var(--accent-light)" : "var(--text-tertiary)",
              cursor: "pointer", letterSpacing: "0.03em",
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Track list */}
      <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 3, paddingBottom: 16 }}>
        {filteredTracks.map((t) => (
          <div
            key={t.name}
            style={{
              padding: "8px 10px",
              borderRadius: "var(--r-md)",
              background: previewingTrack === t.name ? "rgba(16,185,129,0.08)" : "var(--bg-elevated)",
              border: previewingTrack === t.name ? "1px solid rgba(16,185,129,0.35)" : "1px solid var(--border)",
              cursor: "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Preview button */}
              <button
                onClick={() => handlePreview(t.name, t.bpm, t.energy)}
                style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: previewingTrack === t.name ? "#10B981" : "var(--bg-panel)",
                  border: "1px solid var(--border-strong)",
                  cursor: "pointer", color: previewingTrack === t.name ? "#fff" : "var(--text-secondary)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {previewingTrack === t.name ? <Pause size={9} /> : <Play size={9} />}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{t.genre}</span>
                  <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--text-tertiary)", flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{t.bpm} BPM</span>
                  <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--text-tertiary)", flexShrink: 0 }} />
                  <span style={{ fontSize: 8, fontWeight: 700, color: ENERGY_COLORS[t.energy] ?? "#6B7280" }}>{t.energy}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{t.dur}</span>
                <button
                  onClick={() => handleAddToTimeline(t)}
                  style={{
                    width: 20, height: 20, borderRadius: "var(--r-sm)", flexShrink: 0,
                    background: "var(--accent-subtle)", border: "1px solid var(--accent-border)",
                    cursor: "pointer", color: "var(--accent-light)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  title="Add to timeline"
                >
                  <Plus size={10} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Color Studio ────────────────────────────────────────────────────────────

type ColorAdjKey = "exposure" | "contrast" | "saturation" | "temperature" | "tint" | "highlights" | "shadows";

const COLOR_ADJ_CONFIG: { key: ColorAdjKey; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "exposure", label: "Brightness", min: 0, max: 100, step: 1, unit: "%" },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, unit: "" },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, unit: "" },
  { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1, unit: "" },
  { key: "tint", label: "Tint", min: -100, max: 100, step: 1, unit: "" },
  { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1, unit: "" },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1, unit: "" },
];

const DEFAULT_ADJ = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 };

function ColorStudio({
  panelStyle, activeScene, activeSceneId, updateScene,
}: {
  panelStyle: React.CSSProperties;
  activeScene: import("@/store/editorStore").Scene | null;
  activeSceneId: string | null;
  updateScene: (id: string, patch: Partial<import("@/store/editorStore").Scene>) => void;
}) {
  const adj = activeScene?.colorAdjustments ?? DEFAULT_ADJ;
  const grade = activeScene?.colorGrade ?? null;

  function setAdj(key: ColorAdjKey, val: number) {
    if (!activeSceneId) return;
    updateScene(activeSceneId, { colorAdjustments: { ...adj, [key]: val } });
  }

  function resetAdj() {
    if (!activeSceneId) return;
    updateScene(activeSceneId, { colorAdjustments: { ...DEFAULT_ADJ } });
  }

  const hasAdjustments = Object.values(adj).some((v) => v !== 0);
  const disabled = !activeSceneId;

  return (
    <div style={{ ...panelStyle, opacity: disabled ? 0.6 : 1 }}>
      {disabled && (
        <div style={{ padding: "8px 12px 0", fontSize: 10, color: "var(--text-tertiary)", fontStyle: "italic" }}>
          Select a scene to apply color grading
        </div>
      )}

      {/* LUT Presets */}
      <div style={{ padding: "10px 12px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
            LUT Presets
          </div>
          {grade && (
            <button
              onClick={() => activeSceneId && updateScene(activeSceneId, { colorGrade: null })}
              style={{ fontSize: 9, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
            >
              Clear
            </button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          {EFFECTS_LIST.map((e) => {
            const isActive = grade === e;
            return (
              <button
                key={e}
                onClick={() => activeSceneId && updateScene(activeSceneId, { colorGrade: isActive ? null : e })}
                disabled={disabled}
                style={{
                  padding: "8px 6px", borderRadius: "var(--r-md)",
                  background: isActive ? "var(--accent-subtle)" : "var(--bg-elevated)",
                  border: isActive ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                  cursor: disabled ? "not-allowed" : "pointer", textAlign: "center",
                }}
              >
                <div style={{
                  height: 24, borderRadius: "var(--r-xs)", marginBottom: 4,
                  background: effectGradients[e] ?? "linear-gradient(135deg,#6366F1,#A78BFA)",
                  outline: isActive ? "2px solid var(--accent)" : "none", outlineOffset: 1,
                }} />
                <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? "var(--accent-light)" : "var(--text-secondary)", lineHeight: 1.2 }}>{e}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border)", margin: "0 12px 4px" }} />

      {/* Adjustments */}
      <div style={{ padding: "6px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
            Adjustments
          </div>
          {hasAdjustments && (
            <button
              onClick={resetAdj}
              style={{ fontSize: 9, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
            >
              Reset
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {COLOR_ADJ_CONFIG.map(({ key, label, min, max, step }) => {
            const val = adj[key];
            const isZero = val === 0;
            const sliderValue = key === "exposure" ? Math.round(Math.max(0, val) * 100) : val;
            return (
              <div key={key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: isZero ? "var(--text-tertiary)" : "var(--text-secondary)" }}>{label}</span>
                  <span
                    style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: isZero ? "var(--text-tertiary)" : "var(--accent-light)", cursor: "pointer" }}
                    onClick={() => setAdj(key, 0)}
                  >
                    {key === "exposure"
                      ? `${val > 0 ? "+" : ""}${Math.round(val * 100)}%`
                      : val > 0 ? `+${val.toFixed(step < 1 ? 2 : 0)}` : val.toFixed(step < 1 ? 2 : 0)}
                  </span>
                </div>
                <div style={{ position: "relative" }}>
                  {/* Zero marker */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 1, height: 8, background: "var(--border-strong)",
                    transform: "translate(-50%, -50%)", pointerEvents: "none",
                  }} />
                  <input
                    type="range" min={min} max={max} step={step} value={sliderValue}
                    disabled={disabled}
                    onChange={(e) => {
                      const nextValue = parseFloat(e.target.value);
                      setAdj(key, key === "exposure" ? nextValue / 100 : nextValue);
                    }}
                    style={{ width: "100%", accentColor: "var(--accent)", height: 3, cursor: disabled ? "not-allowed" : "pointer" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Apply to all */}
      <div style={{ padding: "8px 12px 16px" }}>
        <button
          disabled={disabled}
          onClick={() => {
            if (!activeSceneId) return;
            const store = useEditorStore.getState();
            store.scenes.forEach((s) => {
              store.updateScene(s.id, { colorGrade: grade, colorAdjustments: { ...adj } });
            });
          }}
          style={{
            width: "100%", padding: "7px 12px", borderRadius: "var(--r-md)",
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: 10, fontWeight: 600,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Apply to All Scenes
        </button>
      </div>
    </div>
  );
}

// ─── Left Panel Tab Content ────────────────────────────────────────────────────

function LeftPanelContent({ tab, onOpenInspector }: { tab: LeftTab; onOpenInspector?: () => void }) {
  const {
    scenes, activeSceneId, clips, totalDuration,
    addCaption, updateScene, setInspectorTarget, removeCaption,
    addClip, assignClip, setActiveScene,
    addAudioTrack,
    brandKit, updateBrandKit,
  } = useEditorStore();
  const router = useRouter();

  const activeScene = scenes.find(s => s.id === activeSceneId) ?? null;
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [showUploadChoice, setShowUploadChoice] = useState(false);

  const panelStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    files.forEach(file => {
      const src = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv)$/i.test(file.name);
      const id = crypto.randomUUID();

      const doAssign = () => {
        const { scenes: ss } = useEditorStore.getState();
        const emptyScene = ss.find(s => !s.clipId);
        if (emptyScene) {
          setActiveScene(emptyScene.id);
          assignClip(id, emptyScene.id);
        }
      };

      if (isVideo) {
        const vid = document.createElement("video");
        vid.preload = "metadata";
        vid.onloadedmetadata = () => {
          addClip({ id, name: file.name, src, file, type: "video" as const, duration: vid.duration });
          doAssign();
        };
        vid.onerror = () => {
          addClip({ id, name: file.name, src, file, type: "video" as const, duration: 5 });
          doAssign();
        };
        vid.src = src;
      } else {
        addClip({ id, name: file.name, src, file, type: "image" as const, duration: 4 });
        doAssign();
      }
    });

    e.target.value = "";
  }

  function handleMusicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    const trackId = crypto.randomUUID();
    let added = false;
    const addTrack = (duration: number) => {
      if (added) return;
      added = true;
      addAudioTrack({
        id: trackId, name: file.name.replace(/\.[^.]+$/, ""),
        src, file, duration,
        volume: 0.8, fadeIn: 0.5, fadeOut: 0.5, startTime: 0, muted: false, type: "bgm",
      });
    };
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => addTrack(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : totalDuration || 60);
    audio.onerror = () => addTrack(totalDuration || 60);
    audio.src = src;
    window.setTimeout(() => addTrack(totalDuration || 60), 1500);
    e.target.value = "";
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    updateBrandKit({ logo: src });
    e.target.value = "";
  }

  function handleAddCaption(preset?: { size: number; weight: string }) {
    if (!activeSceneId) return;
    addCaption(activeSceneId);
    requestAnimationFrame(() => {
      const scene = useEditorStore.getState().scenes.find(s => s.id === activeSceneId);
      const last = scene?.captions.at(-1);
      if (last) {
        if (preset) {
          useEditorStore.getState().updateCaption(activeSceneId, last.id, { fontSize: preset.size });
        }
        setInspectorTarget({ type: "caption", sceneId: activeSceneId, captionId: last.id });
        onOpenInspector?.();
      }
    });
  }

  if (tab === "media")
    return (
      <div style={panelStyle}>
        <input ref={mediaInputRef} id="editor-media-input" type="file" accept="video/*,video/quicktime,video/mp4,video/webm,image/*" multiple style={{ display: "none" }} onChange={handleMediaUpload} />

        {/* Upload choice modal */}
        <AnimatePresence>
          {showUploadChoice && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onClick={() => setShowUploadChoice(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 8 }}
                transition={{ duration: 0.18 }}
                onClick={e => e.stopPropagation()}
                style={{
                  background: "var(--bg-panel)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-2xl)", padding: "28px 24px", width: 380,
                  boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.01em" }}>
                  What are you uploading?
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
                  Choose how these files will be used in your project.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Option 1: Reference media */}
                  <button
                    onClick={() => { setShowUploadChoice(false); mediaInputRef.current?.click(); }}
                    style={{
                      padding: "14px 16px", borderRadius: "var(--r-xl)",
                      background: "var(--bg-elevated)", border: "1px solid var(--border)",
                      cursor: "pointer", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 12,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-border)"; (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: "var(--r-md)", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Film size={16} color="var(--accent-light)" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                        Add to Media Library
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        Upload reference clips or images — assign them to individual scenes in the editor.
                      </div>
                    </div>
                  </button>

                  {/* Option 2: Footage editing */}
                  <button
                    onClick={() => { setShowUploadChoice(false); router.push("/footage"); }}
                    style={{
                      padding: "14px 16px", borderRadius: "var(--r-xl)",
                      background: "var(--bg-elevated)", border: "1px solid var(--border)",
                      cursor: "pointer", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 12,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)"; (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: "var(--r-md)", background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Scissors size={16} color="#A78BFA" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                        Footage Editor — Edit with AI
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        Upload your footage and describe how to edit it. AI arranges, trims and adds transitions.
                      </div>
                    </div>
                  </button>
                </div>

                <button
                  onClick={() => setShowUploadChoice(false)}
                  style={{ marginTop: 16, width: "100%", padding: "8px", borderRadius: "var(--r-md)", background: "transparent", border: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <label
          htmlFor="editor-media-input"
          onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-border)"; (e.currentTarget as HTMLElement).style.background = "var(--accent-subtle)"; }}
          onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
          onDrop={e => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
            const syntheticEvt = { target: { files: e.dataTransfer.files, value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
            handleMediaUpload(syntheticEvt);
          }}
          style={{
            display: "block",
            margin: 12,
            borderRadius: "var(--r-lg)",
            border: "1.5px dashed var(--border-strong)",
            padding: "20px 12px",
            textAlign: "center",
            cursor: "pointer",
            background: "var(--bg-hover)",
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          <Upload size={20} style={{ color: "var(--text-tertiary)", margin: "0 auto 6px" }} />
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
            Drop clips here
            <br />
            <span style={{ color: "var(--accent-light)" }}>or browse files</span>
          </div>
        </label>
        <div style={{ padding: "0 12px 8px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Clips ({clips.length})
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            {clips.map((clip) => (
                <div
                  key={clip.id}
                  onClick={() => {
                    if (activeSceneId) {
                      assignClip(clip.id, activeSceneId);
                    } else {
                      const first = scenes.find(s => !s.clipId);
                      if (first) { setActiveScene(first.id); assignClip(clip.id, first.id); }
                    }
                  }}
                  style={{
                    aspectRatio: "16/9",
                    borderRadius: "var(--r-sm)",
                    overflow: "hidden",
                    background: "var(--bg-elevated)",
                    border: activeScene?.clipId === clip.id ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {clip.type === "video" ? (
                    <video
                      src={clip.src}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <img src={clip.src} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                  )}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0, left: 0, right: 0,
                      padding: "4px 6px",
                      background: "rgba(0,0,0,0.6)",
                      fontSize: 9,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {clip.name}
                  </div>
                  {activeSceneId && activeScene?.clipId === clip.id && (
                    <div style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "#34D399" }} />
                  )}
                </div>
              ))}
            {clips.length === 0 && (
              <div
                style={{
                  gridColumn: "1/-1",
                  padding: "12px 0",
                  textAlign: "center",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                }}
              >
                No clips yet — upload or generate one
              </div>
            )}
          </div>
        </div>
      </div>
    );

  if (tab === "text")
    return (
      <div style={panelStyle}>
        <div style={{ padding: 12 }}>
          {!activeSceneId && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, textAlign: "center" }}>
              Select a scene first
            </div>
          )}
          <button
            onClick={() => handleAddCaption()}
            disabled={!activeSceneId}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: "var(--r-md)",
              background: activeSceneId ? "var(--accent-subtle)" : "var(--bg-elevated)",
              border: "1px solid var(--accent-border)",
              color: activeSceneId ? "var(--accent-light)" : "var(--text-tertiary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: activeSceneId ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Plus size={13} /> Add Caption
          </button>
        </div>

        {/* Existing captions list */}
        {activeScene && activeScene.captions.length > 0 && (
          <div style={{ padding: "0 12px 8px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>
              Captions in scene
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeScene.captions.map((cap, idx) => (
                <div
                  key={cap.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 8px",
                    borderRadius: "var(--r-md)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>
                      {cap.text || "(empty)"}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
                      {cap.fontFamily} · {cap.fontSize}px · {cap.animation !== "none" ? cap.animation : "no fx"}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setInspectorTarget({ type: "caption", sceneId: activeSceneId!, captionId: cap.id });
                      onOpenInspector?.();
                    }}
                    style={{ padding: "3px 7px", borderRadius: "var(--r-sm)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)", color: "var(--accent-light)", fontSize: 9, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeCaption(activeSceneId!, cap.id)}
                    style={{ padding: "3px 6px", borderRadius: "var(--r-sm)", background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 11, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeScene && activeScene.captions.length === 0 && activeSceneId && (
          <div style={{ padding: "4px 12px 8px", fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
            No captions yet — add one above
          </div>
        )}

        <div style={{ height: 1, background: "var(--border)", margin: "4px 12px 8px" }} />

        <div style={{ padding: "0 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>
            Preset Styles
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TEXT_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => handleAddCaption(p)}
                disabled={!activeSceneId}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--r-md)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  cursor: activeSceneId ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: activeSceneId ? 1 : 0.5,
                }}
              >
                <span style={{ fontSize: p.name === "Title" ? 14 : p.name === "Subtitle" ? 13 : 11, fontWeight: p.weight, color: "var(--text-primary)" }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                  {p.size}px
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );

  if (tab === "music")
    return (
      <MusicStudio
        panelStyle={panelStyle}
        musicInputRef={musicInputRef}
        onMusicUpload={handleMusicUpload}
      />
    );

  if (tab === "transitions")
    return (
      <div style={panelStyle}>
        <div style={{ padding: "8px 12px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Transition Types
          </div>
          {activeScene && (
            <div style={{
              marginBottom: 8,
              padding: "8px 10px",
              borderRadius: "var(--r-md)",
              background: "var(--accent-subtle)",
              border: "1px solid var(--accent-border)",
              color: "var(--text-secondary)",
              fontSize: 10,
              lineHeight: 1.5,
            }}>
              <div>
                <strong style={{ color: "var(--accent-light)" }}>Applied:</strong>{" "}
                {activeScene.transition.type.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </div>
              <div>
                <strong style={{ color: "var(--accent-light)" }}>Brightness:</strong>{" "}
                {activeScene.colorAdjustments.exposure >= 0 ? "+" : ""}
                {Math.round(activeScene.colorAdjustments.exposure * 100)}%
              </div>
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 5,
            }}
          >
            {TRANSITIONS_LIST.map((t) => {
              const isActive = activeScene?.transition?.type === t.id;
              return (
                <button
                  key={t.name}
                  onClick={() => activeSceneId && updateScene(activeSceneId, { transition: { type: t.id as TransitionType, duration: 0.5 } })}
                  style={{
                    padding: "10px 6px",
                    borderRadius: "var(--r-md)",
                    background: isActive ? "var(--accent-subtle)" : "var(--bg-elevated)",
                    border: isActive ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1, color: isActive ? "var(--accent-light)" : "var(--text-secondary)" }}>
                    {t.icon}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? "var(--accent-light)" : "var(--text-secondary)" }}>
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );

  if (tab === "brand")
    return (
      <div style={panelStyle}>
        <div
          style={{
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Logo
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
            <div
              onClick={() => logoInputRef.current?.click()}
              style={{
                height: 56,
                borderRadius: "var(--r-md)",
                border: "1.5px dashed var(--border-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-hover)",
                cursor: "pointer",
                gap: 6,
                overflow: "hidden",
              }}
            >
              {brandKit?.logo ? (
                <img src={brandKit.logo} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} alt="logo" />
              ) : (
                <>
                  <Upload size={13} style={{ color: "var(--text-tertiary)" }} />
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Upload logo</span>
                </>
              )}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Brand Colors
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["#6366F1", "#818CF8", "#F59E0B", "#10B981", "#EF4444", "#FFFFFF"].map((c) => (
                <div
                  key={c}
                  title={`Apply ${c} to all captions`}
                  onClick={() => {
                    const store = useEditorStore.getState();
                    store.scenes.forEach(s => s.captions.forEach(cap => store.updateCaption(s.id, cap.id, { color: c })));
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "var(--r-sm)",
                    background: c,
                    border: "1px solid rgba(255,255,255,0.15)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 4 }}>Click a color to apply to all captions</div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Fonts
            </div>
            <select
              onChange={(e) => {
                const font = e.target.value;
                const store = useEditorStore.getState();
                store.scenes.forEach(s => s.captions.forEach(cap => store.updateCaption(s.id, cap.id, { fontFamily: font })));
              }}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: "var(--r-sm)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <option>Inter</option>
              <option>Geist</option>
              <option>Playfair Display</option>
              <option>Bebas Neue</option>
              <option>DM Sans</option>
            </select>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 4 }}>Applies to all captions</div>
          </div>
        </div>
      </div>
    );

  if (tab === "ai")
    return (
      <div style={panelStyle}>
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>
            Quick Actions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {AI_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => {
                  if (a.action === "captions") {
                    if (!activeSceneId) return;
                    // Auto-generate a caption from the scene description
                    const scene = useEditorStore.getState().scenes.find(s => s.id === activeSceneId);
                    if (!scene) return;
                    const text = scene.label || scene.description.split(" ").slice(0, 5).join(" ").toUpperCase();
                    addCaption(activeSceneId);
                    requestAnimationFrame(() => {
                      const updated = useEditorStore.getState().scenes.find(s => s.id === activeSceneId);
                      const last = updated?.captions.at(-1);
                      if (last) {
                        useEditorStore.getState().updateCaption(activeSceneId, last.id, { text, fontSize: 28, bold: true, y: 85 });
                        setInspectorTarget({ type: "caption", sceneId: activeSceneId, captionId: last.id });
                      }
                    });
                  } else if (a.action === "pacing") {
                    // Improve pacing: set all scenes to 4s
                    scenes.forEach(s => updateScene(s.id, { duration: 4 }));
                  } else if (a.action === "transitions") {
                    // Add cinematic fade to all scenes
                    scenes.forEach(s => updateScene(s.id, { transition: { type: "cinematic-fade", duration: 0.7 } }));
                  } else if (a.action === "colorgrade") {
                    // Apply cinematic grade to all scenes
                    scenes.forEach(s => updateScene(s.id, { colorGrade: "Cinematic Grade" }));
                  }
                }}
                disabled={!activeSceneId && a.action === "captions"}
                style={{
                  padding: "9px 12px",
                  borderRadius: "var(--r-md)",
                  background: "var(--accent-subtle)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent-light)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                  opacity: (!activeSceneId && a.action === "captions") ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );

  if (tab === "effects")
    return (
      <ColorStudio
        panelStyle={panelStyle}
        activeScene={activeScene}
        activeSceneId={activeSceneId}
        updateScene={updateScene}
      />
    );

  return null;
}

// ─── Inspector Content ───────────────────────────────────────────────────────

const MOODS: Mood[] = ["luxury", "energetic", "calm", "dramatic", "playful"];
const MOOD_COLORS: Record<Mood, string> = {
  luxury: "#C9A96E",
  energetic: "#F87171",
  calm: "#60A5FA",
  dramatic: "#A78BFA",
  playful: "#34D399",
  neutral: "#94A3B8",
};
const ASPECT_RATIOS: AspectRatio[] = ["9:16", "16:9", "1:1", "4:5", "3:4"];
const ASPECT_LABELS: Record<AspectRatio, string> = {
  "9:16": "Reels",
  "16:9": "YouTube",
  "1:1": "Post",
  "4:5": "Feed",
  "3:4": "Portrait",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)",
  padding: "6px 10px",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
};

function IField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function InspectorContent() {
  const {
    scenes,
    activeSceneId,
    aspectRatio,
    totalDuration,
    setAspectRatio,
    updateScene,
    addScene,
    removeScene,
    inspectorTarget,
  } = useEditorStore();

  const activeScene = scenes.find((s) => s.id === activeSceneId);

  // Caption inspector
  if (inspectorTarget?.type === "caption") {
    const scene = scenes.find((s) => s.id === inspectorTarget.sceneId);
    const caption = scene?.captions.find(
      (c) => c.id === inspectorTarget.captionId
    );
    if (!caption || !scene) return null;
    const upd = (patch: Partial<typeof caption>) =>
      useEditorStore.getState().updateCaption(scene.id, caption.id, patch);

    return (
      <div
        style={{
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: -4,
          }}
        >
          Caption
        </div>
        <IField label="Text">
          <textarea
            value={caption.text}
            onChange={(e) => upd({ text: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </IField>
        <IField label="Font Family">
          <select
            value={caption.fontFamily}
            onChange={(e) => upd({ fontFamily: e.target.value })}
            style={inputStyle}
          >
            {[
              "Inter",
              "Geist",
              "Playfair Display",
              "Bebas Neue",
              "DM Sans",
            ].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </IField>
        <IField label="Font Size">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number"
              value={caption.fontSize}
              min={8}
              max={120}
              step={2}
              onChange={(e) => upd({ fontSize: Number(e.target.value) })}
              style={{ ...inputStyle, textAlign: "right" }}
            />
            <span
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                flexShrink: 0,
              }}
            >
              px
            </span>
          </div>
        </IField>
        <IField label="Color">
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[
              "#FFFFFF",
              "#F0F0F8",
              "#6366F1",
              "#F59E0B",
              "#10B981",
              "#EF4444",
              "#000000",
            ].map((c) => (
              <div
                key={c}
                onClick={() => upd({ color: c })}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "var(--r-xs)",
                  background: c,
                  border:
                    caption.color === c
                      ? "2px solid var(--accent)"
                      : "1px solid rgba(255,255,255,0.15)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </IField>
        <IField label="Animation">
          <select
            value={caption.animation}
            onChange={(e) =>
              upd({
                animation: e.target.value as typeof caption.animation,
              })
            }
            style={inputStyle}
          >
            {[
              "none",
              "fade",
              "slide-up",
              "slide-down",
              "typewriter",
              "scale",
              "bounce",
            ].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </IField>
        <IField label="Position">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 3,
            }}
          >
            {(
              [
                ["TL", 10, 10],
                ["TC", 50, 10],
                ["TR", 90, 10],
                ["ML", 10, 50],
                ["MC", 50, 50],
                ["MR", 90, 50],
                ["BL", 10, 85],
                ["BC", 50, 85],
                ["BR", 90, 85],
              ] as [string, number, number][]
            ).map(([lbl, x, y]) => (
              <button
                key={lbl}
                onClick={() => upd({ x, y })}
                style={{
                  padding: "5px 2px",
                  borderRadius: "var(--r-xs)",
                  fontSize: 9,
                  fontWeight: 600,
                  background:
                    caption.x === x && caption.y === y
                      ? "var(--accent-subtle)"
                      : "var(--bg-elevated)",
                  border: `1px solid ${caption.x === x && caption.y === y ? "var(--accent-border)" : "var(--border)"}`,
                  color:
                    caption.x === x && caption.y === y
                      ? "var(--accent-light)"
                      : "var(--text-tertiary)",
                  cursor: "pointer",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </IField>
      </div>
    );
  }

  // Scene inspector
  if (activeScene) {
    return (
      <div
        style={{
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: -4,
          }}
        >
          Scene
        </div>
        <IField label="Label">
          <input
            value={activeScene.label}
            onChange={(e) =>
              updateScene(activeScene.id, { label: e.target.value })
            }
            style={inputStyle}
          />
        </IField>
        <IField label="Duration">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number"
              value={activeScene.duration}
              min={0.5}
              step={0.5}
              onChange={(e) =>
                updateScene(activeScene.id, { duration: Number(e.target.value) })
              }
              style={{ ...inputStyle, textAlign: "right" }}
            />
            <span
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                flexShrink: 0,
              }}
            >
              s
            </span>
          </div>
        </IField>
        <IField label="Mood">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => updateScene(activeScene.id, { mood: m })}
                style={{
                  padding: "4px 9px",
                  borderRadius: "var(--r-full)",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  background:
                    activeScene.mood === m
                      ? `color-mix(in srgb, ${MOOD_COLORS[m]} 18%, transparent)`
                      : "var(--bg-elevated)",
                  border: `1px solid ${activeScene.mood === m ? MOOD_COLORS[m] + "55" : "var(--border)"}`,
                  color:
                    activeScene.mood === m
                      ? MOOD_COLORS[m]
                      : "var(--text-tertiary)",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </IField>
        <IField label="Transition In">
          <select
            value={activeScene.transition.type}
            onChange={(e) =>
              updateScene(activeScene.id, {
                transition: {
                  ...activeScene.transition,
                  type: e.target
                    .value as typeof activeScene.transition.type,
                },
              })
            }
            style={inputStyle}
          >
            {[
              "cut",
              "fade",
              "dissolve",
              "wipe-left",
              "wipe-right",
              "zoom-in",
              "slide-left",
              "glitch",
              "cinematic-fade",
            ].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </IField>
        <IField label="Description">
          <textarea
            value={activeScene.description}
            rows={2}
            onChange={(e) =>
              updateScene(activeScene.id, { description: e.target.value })
            }
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </IField>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}
        >
          <button
            onClick={() => addScene(activeScene.id)}
            style={{
              padding: "7px 10px",
              borderRadius: "var(--r-sm)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={11} /> Add Scene After
          </button>
          <button
            onClick={() => removeScene(activeScene.id)}
            style={{
              padding: "7px 10px",
              borderRadius: "var(--r-sm)",
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.18)",
              color: "var(--error)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Trash2 size={11} /> Delete Scene
          </button>
        </div>
      </div>
    );
  }

  // Default: project settings
  return (
    <div
      style={{
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: -4,
        }}
      >
        Project
      </div>
      <IField label="Aspect Ratio">
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar}
              onClick={() => setAspectRatio(ar)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--r-sm)",
                fontSize: 11,
                fontWeight: 600,
                background:
                  aspectRatio === ar
                    ? "var(--accent-subtle)"
                    : "var(--bg-elevated)",
                border: `1px solid ${aspectRatio === ar ? "var(--accent-border)" : "var(--border)"}`,
                color:
                  aspectRatio === ar
                    ? "var(--accent-light)"
                    : "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{ar}</span>
              <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                {ASPECT_LABELS[ar]}
              </span>
            </button>
          ))}
        </div>
      </IField>
      <IField label="Duration">
        <div
          style={{
            padding: "7px 10px",
            borderRadius: "var(--r-sm)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            fontSize: 12,
            fontFamily: "monospace",
            color: "var(--text-secondary)",
          }}
        >
          {formatTime(totalDuration)}
        </div>
      </IField>
      <IField label="Scenes">
        <div
          style={{
            padding: "7px 10px",
            borderRadius: "var(--r-sm)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          {scenes.length}
        </div>
      </IField>
    </div>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  ts: number;
  isError?: boolean;
}

// ─── Audio Playback Engine ────────────────────────────────────────────────────

function useAudioPlayback() {
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const { audioTracks, isPlaying, currentTime, isMuted, volume } = useEditorStore();

  useEffect(() => {
    const existing = audioElsRef.current;
    const activeIds = new Set(audioTracks.map(t => t.id));

    // Remove stale elements
    for (const [id, el] of existing) {
      if (!activeIds.has(id)) {
        el.pause();
        el.src = "";
        existing.delete(id);
      }
    }

    // Create/update elements
    for (const track of audioTracks) {
      if (!track.src) continue;
      let el = existing.get(track.id);
      if (!el) {
        el = new Audio();
        el.preload = "auto";
        existing.set(track.id, el);
      }
      if (el.src !== track.src) el.src = track.src;
      el.volume = track.muted ? 0 : Math.min(1, (track.volume ?? 0.8) * (isMuted ? 0 : volume));
      el.loop = true;

      const trackStart = track.startTime ?? 0;
      const relTime = currentTime - trackStart;

      if (isPlaying && relTime >= 0 && relTime < (track.duration || Infinity)) {
        if (Math.abs(el.currentTime - relTime) > 0.4) el.currentTime = Math.max(0, relTime);
        el.play().catch(() => {});
      } else {
        el.pause();
        if (!isPlaying && relTime >= 0) el.currentTime = Math.max(0, relTime);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentTime, audioTracks, isMuted, volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const el of audioElsRef.current.values()) {
        el.pause();
        el.src = "";
      }
    };
  }, []);
}

const QUICK_CHIPS = [
  "Add captions to all scenes",
  "Improve pacing (faster)",
  "Apply cinematic transitions",
  "Trim first clip to 4s",
  "Apply luxury color grade",
  "Make it black and white",
  "Increase subtitle size",
  "Set mood to dramatic",
];

function inferSpeedCommand(text: string): number | null {
  const lower = text.toLowerCase();
  const explicit = lower.match(/(?:speed|playback|faster|slow(?:er)?).{0,20}?(\d+(?:\.\d+)?)\s*x/);
  if (explicit) return Math.max(0.25, Math.min(4, Number(explicit[1])));
  const percent = lower.match(/(?:increase|boost|raise|speed up).{0,20}?(\d{1,3})\s*%/);
  if (percent) return Math.max(0.25, Math.min(4, 1 + Number(percent[1]) / 100));
  if (/\b(increase|boost|raise|speed up|make).{0,20}\b(speed|faster)\b|\b(make|play).{0,20}\bfaster\b/.test(lower)) return 1.3;
  if (/\b(slow down|slower|reduce speed)\b/.test(lower)) return 0.75;
  return null;
}

function applyPlaybackRateToScenes(store: ReturnType<typeof useEditorStore.getState>, rate: number) {
  store.scenes.forEach((scene) => {
    const clip = scene.clipId ? store.clips.find((item) => item.id === scene.clipId) : null;
    const oldRate = scene.playbackRate ?? 1;
    const sourceDuration = clip?.duration || scene.duration * oldRate;
    const nextDuration = Math.max(0.5, Number((sourceDuration / rate).toFixed(2)));
    const captions = scene.captions.map((caption) => ({
      ...caption,
      startTime: Math.min(nextDuration, Number((caption.startTime / rate).toFixed(2))),
      endTime: Math.min(nextDuration, Math.max(0.2, Number((caption.endTime / rate).toFixed(2)))),
    }));
    store.updateScene(scene.id, {
      playbackRate: rate,
      duration: nextDuration,
      captions,
    });
  });
}

async function transcribeSceneCaptions(scene: Scene): Promise<Caption[]> {
  if (!scene.clipSrc || scene.clipType !== "video") return [];
  const media = await fetch(scene.clipSrc);
  if (!media.ok) throw new Error(`Could not read ${scene.label}`);
  const blob = await media.blob();
  const form = new FormData();
  form.append("file", blob, `${scene.label || scene.id}.mp4`);
  form.append("duration", String(scene.duration * (scene.playbackRate ?? 1)));
  const res = await fetch("/api/transcribe-clip", { method: "POST", body: form });
  const data = await res.json().catch(() => ({})) as {
    captions?: Array<{ text: string; startTime: number; endTime: number }>;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `Could not transcribe ${scene.label}`);
  const rate = scene.playbackRate ?? 1;
  return (data.captions ?? []).map((caption) => ({
    id: crypto.randomUUID(),
    text: caption.text,
    startTime: Math.max(0, Number((caption.startTime / rate).toFixed(2))),
    endTime: Math.min(scene.duration, Math.max(0.2, Number((caption.endTime / rate).toFixed(2)))),
    x: 10,
    y: 82,
    fontSize: 28,
    fontFamily: "Inter",
    color: "#FFFFFF",
    bgColor: "#000000",
    bgOpacity: 0.45,
    bold: true,
    italic: false,
    align: "center",
    animation: "fade",
    letterSpacing: 0.02,
    lineHeight: 1.25,
    stroke: false,
    strokeColor: "#000000",
    shadow: true,
  }));
}

async function processAICommand(
  text: string,
  store: ReturnType<typeof useEditorStore.getState>
): Promise<string> {
  const lower = text.toLowerCase();
  const currentStore = () => useEditorStore.getState();
  const sceneCount = store.scenes.length;

  const speed = inferSpeedCommand(text);
  if (speed) {
    applyPlaybackRateToScenes(currentStore(), speed);
    return `Set clip playback speed to ${speed.toFixed(2)}x and trimmed scene durations to match.`;
  }

  if (lower.includes("transition")) {
    const type = lower.includes("cinematic")
      ? "cinematic-fade"
      : inferRequestedTransition(text) ?? "zoom-in";
    const duration = type === "cut" ? 0.1 : type === "cinematic-fade" ? 0.7 : 0.6;
    currentStore().scenes.forEach((s) =>
      currentStore().updateScene(s.id, {
        transition: {
          type: type as import("@/store/editorStore").TransitionType,
          duration,
        },
      })
    );
    currentStore().setLeftTab("transitions");
    return `Applied ${type.replace(/-/g, " ")} transitions to all ${sceneCount} scenes.`;
  }
  if (
    lower.includes("caption") &&
    (lower.includes("add") || lower.includes("generate"))
  ) {
    let changed = 0;
    let failed = 0;
    for (const sc of currentStore().scenes) {
      try {
        const captions = await transcribeSceneCaptions(sc);
        if (captions.length > 0) {
          currentStore().updateScene(sc.id, { captions });
          changed += 1;
        }
      } catch {
        failed += 1;
      }
    }
    currentStore().setLeftTab("text");
    if (changed === 0) {
      return failed > 0
        ? "I could not transcribe speech from these clips. Please check that the clips have audible dialogue."
        : "No spoken words were detected in the clips.";
    }
    return `Added spoken-word captions to ${changed} of ${sceneCount} scenes${failed ? ` (${failed} failed)` : ""}.`;
  }
  if (lower.includes("faster") || lower.includes("pacing")) {
    currentStore().scenes.forEach((s) => {
      if (s.duration > 2)
        currentStore().updateScene(s.id, { duration: Math.max(2, Number((s.duration * 0.7).toFixed(2))) });
    });
    return "Reduced all scene durations by 30% for faster pacing.";
  }
  if (lower.includes("slower")) {
    currentStore().scenes.forEach((s) =>
      currentStore().updateScene(s.id, { duration: Number((s.duration * 1.4).toFixed(2)) })
    );
    return "Increased all scene durations by 40%.";
  }
  // Trim first clip to N seconds
  const trimMatch = lower.match(/trim.*?(\d+)\s*s(?:ec)?/);
  if (trimMatch && store.scenes.length > 0) {
    const secs = parseInt(trimMatch[1]);
    const first = currentStore().scenes[0];
    currentStore().updateScene(first.id, { duration: Math.max(1, secs) });
    return `Trimmed first scene to ${secs} seconds.`;
  }
  // Subtitle / caption size
  if ((lower.includes("subtitle") || lower.includes("caption")) && (lower.includes("size") || lower.includes("larger") || lower.includes("bigger") || lower.includes("smaller"))) {
    const larger = lower.includes("larger") || lower.includes("bigger") || lower.includes("increase");
    let changed = 0;
    currentStore().scenes.forEach((sc) => {
      sc.captions.forEach((cap) => {
        currentStore().updateCaption(sc.id, cap.id, { fontSize: larger ? Math.min(64, cap.fontSize + 8) : Math.max(12, cap.fontSize - 6) });
        changed += 1;
      });
    });
    currentStore().setLeftTab("text");
    return changed
      ? `${larger ? "Increased" : "Decreased"} ${changed} subtitle${changed === 1 ? "" : "s"}.`
      : "No captions found. Add captions first, then resize them.";
  }
  const requestedColor = inferRequestedColorAdjustments(text);
  if (requestedColor) {
    currentStore().scenes.forEach((s) =>
      currentStore().updateScene(s.id, {
        colorAdjustments: { ...s.colorAdjustments, ...requestedColor },
      })
    );
    currentStore().setLeftTab("effects");
    const parts = Object.entries(requestedColor)
      .filter(([, value]) => value !== 0)
      .map(([key, value]) => key === "exposure" ? `brightness ${Math.round(value * 100)}%` : `${key} ${value}`)
      .join(", ");
    return `Applied ${parts} to all ${sceneCount} scenes.`;
  }
  const requestedGrade = inferRequestedColorGrade(text);
  if (requestedGrade) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: requestedGrade }));
    currentStore().setLeftTab("effects");
    return `Applied ${requestedGrade} to all ${sceneCount} scenes.`;
  }
  // Color grade — maps natural language to available LUT presets
  if (lower.includes("black and white") || lower.includes("b&w") || lower.includes("grayscale") || lower.includes("greyscale")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: "Black & White" }));
    currentStore().setLeftTab("effects");
    return "Applied Black & White grade to all scenes.";
  }
  if (lower.includes("warm") && (lower.includes("tone") || lower.includes("grade") || lower.includes("filter") || lower.includes("color"))) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: "Warm Sunset" }));
    currentStore().setLeftTab("effects");
    return "Applied Warm Sunset color grade to all scenes.";
  }
  if (lower.includes("cool") || lower.includes("cold") || lower.includes("mist") || lower.includes("blue tone")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: "Cool Mist" }));
    currentStore().setLeftTab("effects");
    return "Applied Cool Mist grade to all scenes.";
  }
  if (lower.includes("vintage") || lower.includes("retro") || lower.includes("film grain")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: "Vintage Film" }));
    currentStore().setLeftTab("effects");
    return "Applied Vintage Film grade to all scenes.";
  }
  if (lower.includes("neon") || lower.includes("glow") || lower.includes("vibrant")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: "Neon Glow" }));
    currentStore().setLeftTab("effects");
    return "Applied Neon Glow grade to all scenes.";
  }
  if (lower.includes("teal") || lower.includes("orange")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: "Teal & Orange" }));
    currentStore().setLeftTab("effects");
    return "Applied Teal & Orange grade to all scenes.";
  }
  if (lower.includes("desaturate") || lower.includes("muted color")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: "Desaturated" }));
    currentStore().setLeftTab("effects");
    return "Applied Desaturated grade to all scenes.";
  }
  if (lower.includes("color grade") || lower.includes("cinematic grade") || lower.includes("luxury grade") || lower.includes("cinematic look")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: "Cinematic Grade" }));
    currentStore().setLeftTab("effects");
    return "Applied Cinematic Grade to all scenes.";
  }
  if (lower.includes("remove grade") || lower.includes("clear grade") || lower.includes("no filter") || lower.includes("original color")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { colorGrade: null }));
    currentStore().setLeftTab("effects");
    return "Removed color grade from all scenes.";
  }

  // Mood
  if (lower.includes("luxury") || (lower.includes("mood") && lower.includes("luxury"))) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { mood: "luxury" as Mood }));
    return 'Set mood to "luxury" on all scenes.';
  }
  if (lower.includes("energetic") || lower.includes("energy") || lower.includes("hype")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { mood: "energetic" as Mood }));
    return 'Set mood to "energetic" on all scenes.';
  }
  if (lower.includes("calm") || lower.includes("serene") || lower.includes("peaceful")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { mood: "calm" as Mood }));
    return 'Set mood to "calm" on all scenes.';
  }
  if (lower.includes("dramatic") || lower.includes("intense") || lower.includes("dark")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { mood: "dramatic" as Mood }));
    return 'Set mood to "dramatic" on all scenes.';
  }
  if (lower.includes("playful") || lower.includes("fun") || lower.includes("happy")) {
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { mood: "playful" as Mood }));
    return 'Set mood to "playful" on all scenes.';
  }

  // Duration / length
  const durMatch = lower.match(/(?:make|set).{0,20}(?:video|total|length|duration).{0,10}(\d+)\s*s/);
  if (durMatch) {
    const target = parseInt(durMatch[1]);
    const perScene = Math.max(1, target / Math.max(1, currentStore().scenes.length));
    currentStore().scenes.forEach((s) => currentStore().updateScene(s.id, { duration: parseFloat(perScene.toFixed(1)) }));
    return `Set each scene to ~${perScene.toFixed(1)}s for a total of ~${target}s.`;
  }

  // Remove / clear captions
  if ((lower.includes("remove") || lower.includes("delete") || lower.includes("clear")) && (lower.includes("caption") || lower.includes("subtitle") || lower.includes("text"))) {
    currentStore().scenes.forEach((sc) => currentStore().updateScene(sc.id, { captions: [] }));
    currentStore().setLeftTab("text");
    return "Removed all captions from all scenes.";
  }

  // Replace / change music — mute existing and suggest via left panel
  if ((lower.includes("replace") || lower.includes("change") || lower.includes("remove")) && (lower.includes("music") || lower.includes("audio") || lower.includes("sound"))) {
    store.audioTracks.forEach((t) => store.updateAudioTrack(t.id, { muted: true }));
    return "Muted existing music tracks. Open the Music tab to add a new track.";
  }

  // Volume
  const volMatch = lower.match(/(?:set|change|reduce|increase).{0,15}(?:volume|music|audio).{0,10}(\d+)\s*%/);
  if (volMatch) {
    const vol = Math.min(1, parseInt(volMatch[1]) / 100);
    store.audioTracks.forEach((t) => store.updateAudioTrack(t.id, { volume: vol }));
    return `Set music volume to ${volMatch[1]}%.`;
  }

  // Fallback — helpful message
  return `I can help with: transitions, captions, pacing, color grades, mood, trim, and music. Try: "apply cinematic grade", "make it faster", "add captions", "set mood to dramatic".`;
}

function AIChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "0",
      role: "system",
      text: "Hi! I'm your AI creative director. Ask me to refine your video, change the pacing, add captions, or anything else.",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", text: text.trim(), ts: Date.now() },
      ]);
      setInput("");
      setLoading(true);
      try {
        const reply = await processAICommand(
          text.trim(),
          useEditorStore.getState()
        );
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: "assistant", text: reply, ts: Date.now() },
        ]);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            isError: true,
            text: e instanceof Error ? e.message : "Something went wrong.",
            ts: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Chat history */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 12px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            {msg.role !== "user" && (
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "var(--accent-subtle)",
                  border: "1px solid var(--accent-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <Sparkles size={11} style={{ color: "var(--accent-light)" }} />
              </div>
            )}
            <div
              style={{
                maxWidth: "80%",
                padding: "8px 11px",
                borderRadius:
                  msg.role === "user"
                    ? "12px 12px 3px 12px"
                    : "12px 12px 12px 3px",
                background:
                  msg.role === "user"
                    ? "var(--accent)"
                    : msg.isError
                    ? "rgba(239,68,68,0.08)"
                    : "var(--bg-elevated)",
                border:
                  msg.role === "user"
                    ? "none"
                    : msg.isError
                    ? "1px solid rgba(239,68,68,0.2)"
                    : "1px solid var(--border)",
                fontSize: 12,
                lineHeight: 1.55,
                color:
                  msg.role === "user"
                    ? "#fff"
                    : msg.isError
                    ? "var(--error)"
                    : "var(--text-secondary)",
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--accent-subtle)",
                border: "1px solid var(--accent-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Sparkles size={11} style={{ color: "var(--accent-light)" }} />
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "12px 12px 12px 3px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    animation: `bounce 1.2s ${i * 0.2}s ease infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick chips */}
      <div
        style={{
          padding: "0 12px 10px",
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
        }}
      >
        {QUICK_CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => send(c)}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--r-full)",
              fontSize: 10,
              fontWeight: 500,
              background: "var(--accent-subtle)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent-light)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div
        style={{
          padding: "8px 12px 12px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask your AI director..."
          disabled={loading}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(16px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "var(--r-lg)",
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--r-md)",
            flexShrink: 0,
            background:
              input.trim() && !loading
                ? "var(--accent)"
                : "var(--bg-elevated)",
            border: `1px solid ${input.trim() && !loading ? "transparent" : "var(--border)"}`,
            cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.12s",
          }}
        >
          <ArrowRight
            size={14}
            style={{
              color:
                input.trim() && !loading ? "#fff" : "var(--text-tertiary)",
            }}
          />
        </button>
      </div>
    </div>
  );
}

// ─── Canvas Preview ──────────────────────────────────────────────────────────

const MOOD_TINTS: Record<Mood, string> = {
  luxury: "rgba(201,169,110,0.12)",
  energetic: "rgba(248,113,113,0.10)",
  calm: "rgba(96,165,250,0.10)",
  dramatic: "rgba(167,139,250,0.12)",
  playful: "rgba(52,211,153,0.10)",
  neutral: "rgba(148,163,184,0.08)",
};

const MOOD_GRADIENTS: Record<Mood, string> = {
  luxury:    "linear-gradient(135deg, #1a1208 0%, #2d2010 40%, #3d2d14 100%)",
  energetic: "linear-gradient(135deg, #1a0808 0%, #2d1010 40%, #3d1414 100%)",
  calm:      "linear-gradient(135deg, #081018 0%, #0e1e30 40%, #0d2540 100%)",
  dramatic:  "linear-gradient(135deg, #0e0818 0%, #1a1030 40%, #20153d 100%)",
  playful:   "linear-gradient(135deg, #081a12 0%, #0e2d1e 40%, #103d28 100%)",
  neutral:   "linear-gradient(135deg, #0d0d12 0%, #141420 40%, #181825 100%)",
};

function ScenePlaceholder({
  scene,
  sceneIndex,
  totalScenes,
}: {
  scene: Scene | null;
  sceneIndex: number;
  totalScenes: number;
}) {
  const moodColor = scene ? MOOD_COLORS[scene.mood] : "#6366F1";
  const gradient = scene ? MOOD_GRADIENTS[scene.mood] : "linear-gradient(160deg, #0d0d14 0%, #1a1a2e 100%)";

  return (
    <div style={{ width: "100%", height: "100%", background: gradient, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)", backgroundSize: "33.333% 33.333%", pointerEvents: "none" }} />

      {/* Scene HUD */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)", zIndex: 2 }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em" }}>
          SC {String(sceneIndex + 1).padStart(2, "0")}
        </span>
        {scene && (
          <>
            <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 3, background: `${moodColor}18`, border: `1px solid ${moodColor}28` }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: moodColor }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: moodColor, textTransform: "uppercase", letterSpacing: "0.1em" }}>{scene.mood}</span>
            </div>
          </>
        )}
        <div style={{ flex: 1 }} />
        {totalScenes > 0 && (
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
            {sceneIndex + 1}/{totalScenes}
          </span>
        )}
      </div>

      {/* Center: upload hint */}
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 24px" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${moodColor}18`, border: `1px solid ${moodColor}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <Upload size={16} color={moodColor} style={{ opacity: 0.7 }} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
          Drop a clip or use Media panel
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
          Use AI chat to refine · ⌘K
        </div>
      </div>

      {/* Bottom info */}
      {scene && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)", padding: "28px 14px 12px", zIndex: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>{scene.label}</div>
          {scene.description && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
              {scene.description}
            </div>
          )}
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 4, display: "block" }}>{scene.duration}s</span>
        </div>
      )}
    </div>
  );
}

function TimecodePill() {
  const currentTime = useEditorStore(s => s.currentTime);
  return (
    <div style={{
      position: "absolute", top: 10, left: 10,
      padding: "3px 8px", borderRadius: "var(--r-full)",
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
      fontSize: 9, fontFamily: "monospace", fontWeight: 600,
      color: "rgba(255,255,255,0.65)", pointerEvents: "none",
    }}>
      {formatTime(currentTime)}
    </div>
  );
}

function CanvasPreview({
  containerWidth,
  containerHeight,
  onCaptionClick,
  transportVideoRef,
}: {
  containerWidth: number;
  containerHeight: number;
  onCaptionClick?: (sceneId: string, captionId: string) => void;
  transportVideoRef?: { current: HTMLVideoElement | null };
}) {
  const { scenes, activeSceneId, aspectRatio, brandKit } = useEditorStore();
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0];
  const resolvedActiveSceneId = activeScene?.id ?? null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const applyVideoAudioPreference = useCallback((node: HTMLVideoElement) => {
    node.muted = activeScene?.muteVideoAudio === true;
    node.playbackRate = activeScene?.playbackRate ?? 1;
  }, [activeScene?.muteVideoAudio, activeScene?.playbackRate]);
  const setVideoElement = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (transportVideoRef) transportVideoRef.current = node;
    if (node) applyVideoAudioPreference(node);
  }, [applyVideoAudioPreference, transportVideoRef]);

  // Transition flash state
  const [transitionFlash, setTransitionFlash] = useState<{ type: string; opacity: number } | null>(null);
  const [enterAnim, setEnterAnim] = useState<string | null>(null);
  const prevSceneIdRef = useRef<string | null>(null);

  // Caption drag state
  const dragCaptionRef = useRef<{ captionId: string; sceneId: string; startX: number; startY: number; startCX: number; startCY: number } | null>(null);

  // Offset of the active scene within the full timeline
  const sceneStartTime = useMemo(() => {
    let offset = 0;
    for (const s of scenes) {
      if (s.id === resolvedActiveSceneId) break;
      offset += s.duration;
    }
    return offset;
  }, [scenes, resolvedActiveSceneId]);

  useEffect(() => {
    if (resolvedActiveSceneId && resolvedActiveSceneId !== activeSceneId) {
      useEditorStore.getState().setActiveScene(resolvedActiveSceneId);
    }
  }, [activeSceneId, resolvedActiveSceneId]);

  // When the video src changes (new scene clip), seek and play once metadata is ready
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeScene?.clipSrc) return;

    function seekAndPlay() {
      if (!v) return;
      const store = useEditorStore.getState();
      let elapsed = 0;
      for (const s of store.scenes) {
        if (s.id === store.activeSceneId) break;
        elapsed += s.duration;
      }
      const localTime = Math.max(0, store.currentTime - elapsed);
      v.playbackRate = activeScene?.playbackRate ?? 1;
      v.currentTime = localTime * (activeScene?.playbackRate ?? 1);
      if (store.isPlaying) {
        applyVideoAudioPreference(v);
        void playMediaElement(v);
      }
    }

    if (v.readyState >= 2) {
      seekAndPlay();
    } else {
      v.addEventListener("loadeddata", seekAndPlay, { once: true });
      return () => v.removeEventListener("loadeddata", seekAndPlay);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScene?.clipSrc, activeScene?.playbackRate]);

  // Play / pause + scrub sync — single subscription avoids re-rendering CanvasPreview every RAF frame
  useEffect(() => {
    let prevIsPlaying = useEditorStore.getState().isPlaying;
    let prevCurrentTime = useEditorStore.getState().currentTime;

    // Sync immediately on mount
    const { isPlaying: initPlaying, currentTime: initTime } = useEditorStore.getState();
    const v0 = videoRef.current;
    if (v0) {
      if (initPlaying) {
        const local = Math.max(0, initTime - sceneStartTime);
        if (Math.abs(v0.currentTime - local) > 0.35) v0.currentTime = local;
        applyVideoAudioPreference(v0);
        void playMediaElement(v0);
      } else {
        v0.pause();
      }
    }

    return useEditorStore.subscribe((state) => {
      const v = videoRef.current;
      if (!v) return;

      // isPlaying changed
      if (state.isPlaying !== prevIsPlaying) {
        prevIsPlaying = state.isPlaying;
        if (state.isPlaying) {
          const local = Math.max(0, state.currentTime - sceneStartTime);
          const rate = activeScene?.playbackRate ?? 1;
          v.playbackRate = rate;
          if (Math.abs(v.currentTime - local * rate) > 0.35) v.currentTime = local * rate;
          applyVideoAudioPreference(v);
          void playMediaElement(v);
        } else {
          v.pause();
        }
      }

      // Scrub sync while paused
      if (!state.isPlaying && state.currentTime !== prevCurrentTime) {
        prevCurrentTime = state.currentTime;
        const local = Math.max(0, state.currentTime - sceneStartTime);
        if (Math.abs(v.currentTime - local) > 0.05) v.currentTime = local;
      }
    });
  }, [applyVideoAudioPreference, sceneStartTime]);

  // Transition flash + enter animation when scene changes (merged effect)
  useEffect(() => {
    if (prevSceneIdRef.current !== null && prevSceneIdRef.current !== resolvedActiveSceneId) {
      const prevScene = scenes.find(s => s.id === prevSceneIdRef.current);
      const type = prevScene?.transition?.type ?? "cut";
      const dur = (prevScene?.transition?.duration ?? 0.5) * 1000;

      if (type !== "cut") {
        // Flash overlay
        setTransitionFlash({ type, opacity: 1 });
        setTimeout(() => setTransitionFlash(null), dur);

        // Enter animation on new scene
        setEnterAnim(type);
        setTimeout(() => setEnterAnim(null), dur + 100);
      }
    }
    prevSceneIdRef.current = resolvedActiveSceneId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedActiveSceneId]);

  // Caption drag — global mouse handlers
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragCaptionRef.current;
      if (!drag) return;
      const container = canvasContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const dx = ((e.clientX - drag.startX) / rect.width) * 100;
      const dy = ((e.clientY - drag.startY) / rect.height) * 100;
      const newX = Math.max(5, Math.min(95, drag.startCX + dx));
      const newY = Math.max(5, Math.min(95, drag.startCY + dy));
      useEditorStore.getState().updateCaption(drag.sceneId, drag.captionId, { x: newX, y: newY });
    }
    function onUp() {
      dragCaptionRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const [arW, arH] = aspectRatio.split(":").map(Number);
  let previewW = containerWidth - 48;
  let previewH = (previewW / arW) * arH;
  if (previewH > containerHeight - 48) {
    previewH = containerHeight - 48;
    previewW = (previewH / arH) * arW;
  }
  previewW = Math.floor(previewW);
  previewH = Math.floor(previewH);

  const tint = activeScene ? MOOD_TINTS[activeScene.mood] ?? "transparent" : "transparent";
  const glowColor = activeScene ? MOOD_COLORS[activeScene.mood] : "#6366F1";
  const cssFilter = buildCSSFilter(activeScene?.colorAdjustments, activeScene?.colorGrade ?? null);

  // Transition overlay style
  const transitionOverlayStyle = useMemo((): React.CSSProperties => {
    if (!transitionFlash) return { display: "none" };
    const type = transitionFlash.type;
    if (type === "fade" || type === "cinematic-fade" || type === "dissolve") {
      return { position: "absolute", inset: 0, background: "rgba(0,0,0,0.9)", opacity: transitionFlash.opacity, pointerEvents: "none", transition: "opacity 0.5s ease", zIndex: 10 };
    }
    if (type === "flash" || type === "light-leak") {
      return { position: "absolute", inset: 0, background: "rgba(255,255,255,0.95)", opacity: transitionFlash.opacity, pointerEvents: "none", transition: "opacity 0.4s ease", zIndex: 10 };
    }
    if (type === "blur") {
      return { position: "absolute", inset: 0, backdropFilter: "blur(20px)", opacity: transitionFlash.opacity, pointerEvents: "none", transition: "opacity 0.5s ease", zIndex: 10 };
    }
    if (type === "glitch") {
      return { position: "absolute", inset: 0, background: "rgba(99,102,241,0.5)", opacity: transitionFlash.opacity, pointerEvents: "none", transition: "opacity 0.3s ease", zIndex: 10, mixBlendMode: "screen" };
    }
    return { position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", opacity: transitionFlash.opacity, pointerEvents: "none", transition: "opacity 0.4s ease", zIndex: 10 };
  }, [transitionFlash]);

  // Enter animation style applied to video/image element
  const enterStyle = useMemo((): React.CSSProperties => {
    if (!enterAnim) return {};
    const dur = `${activeScene?.transition?.duration ?? 0.5}s`;
    switch (enterAnim) {
      case "zoom-out":
        return { animation: `zoomOutEnter ${dur} ease-out forwards` };
      case "zoom-in":
        return { animation: `zoomInEnter ${dur} ease-out forwards` };
      case "fade":
      case "cinematic-fade":
      case "dissolve":
        return { animation: `fadeEnter ${dur} ease-out forwards` };
      case "slide-left":
        return { animation: `slideLeftEnter ${dur} ease-out forwards` };
      case "slide-right":
        return { animation: `slideRightEnter ${dur} ease-out forwards` };
      case "whip":
        return { animation: `whipEnter ${dur} ease-out forwards` };
      default:
        return {};
    }
  }, [enterAnim, activeScene?.transition?.duration]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0a0d",
        backgroundImage: "radial-gradient(circle at 50% 50%, #12121a 0%, #0a0a0d 70%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {!activeScene?.clipSrc && (
        <div style={{
          position: "absolute",
          width: previewW + 80,
          height: previewH + 80,
          borderRadius: 16,
          background: `radial-gradient(ellipse at 50% 50%, ${glowColor}0a 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
      )}
      <div
        ref={canvasContainerRef}
        style={{
          width: previewW,
          height: previewH,
          background: "#000",
          borderRadius: 6,
          boxShadow: activeScene?.clipSrc
            ? "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)"
            : `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06), 0 0 40px ${glowColor}14`,
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {activeScene?.clipSrc ? (
          activeScene.clipType === "video" ? (
            <video
              data-testid="editor-main-preview-video"
              ref={setVideoElement}
              src={activeScene.clipSrc}
              muted={activeScene.muteVideoAudio === true}
              style={{
                width: "100%", height: "100%", objectFit: "cover",
                filter: cssFilter !== "none" ? cssFilter : undefined,
                ...enterStyle,
              }}
              playsInline
              preload="auto"
              onLoadedData={(e) => {
                if (useEditorStore.getState().isPlaying) {
                  applyVideoAudioPreference(e.currentTarget);
                  void playMediaElement(e.currentTarget);
                }
              }}
            />
          ) : (
            <img
              src={activeScene.clipSrc}
              style={{
                width: "100%", height: "100%", objectFit: "cover",
                filter: cssFilter !== "none" ? cssFilter : undefined,
                ...enterStyle,
              }}
              alt=""
            />
          )
        ) : (
          <ScenePlaceholder
            scene={activeScene ?? null}
            sceneIndex={activeScene ? scenes.findIndex(s => s.id === activeScene.id) : 0}
            totalScenes={scenes.length}
          />
        )}

        {/* Mood tint overlay */}
        {tint !== "transparent" && (
          <div style={{ position: "absolute", inset: 0, background: tint, pointerEvents: "none" }} />
        )}

        {/* Transition flash overlay */}
        <div style={transitionOverlayStyle} />

        {/* Captions — draggable + clickable to open inspector */}
        {activeScene?.captions.map((cap) => (
          <div
            key={cap.id}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              dragCaptionRef.current = {
                captionId: cap.id,
                sceneId: activeScene.id,
                startX: e.clientX,
                startY: e.clientY,
                startCX: cap.x,
                startCY: cap.y,
              };
              document.body.style.cursor = "move";
              document.body.style.userSelect = "none";
              // Also open inspector on click (mousedown without move = click)
              useEditorStore.getState().setInspectorTarget({ type: "caption", sceneId: activeScene.id, captionId: cap.id });
              onCaptionClick?.(activeScene.id, cap.id);
            }}
            style={{
              position: "absolute",
              left: `${cap.x}%`,
              top: `${cap.y}%`,
              transform: "translate(-50%, -50%)",
              fontSize: cap.fontSize * (previewW / 1080),
              fontWeight: cap.bold ? "bold" : "normal",
              fontStyle: cap.italic ? "italic" : "normal",
              color: cap.color,
              textAlign: cap.align,
              textShadow: cap.shadow ? "0 2px 8px rgba(0,0,0,0.8)" : "none",
              pointerEvents: "auto",
              maxWidth: "80%",
              cursor: "move",
              outline: "none",
              borderRadius: 2,
              userSelect: "none",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.outline = "1.5px dashed rgba(99,102,241,0.7)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
          >
            {cap.text}
          </div>
        ))}

        {/* Aspect ratio badge */}
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            padding: "3px 8px",
            borderRadius: "var(--r-full)",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(255,255,255,0.7)",
            letterSpacing: "0.06em",
            pointerEvents: "none",
          }}
        >
          {aspectRatio}
        </div>

        {/* Brand logo watermark */}
        {brandKit?.logo && (
          <img
            src={brandKit.logo}
            alt="Brand logo"
            style={{
              position: "absolute",
              left: 12,
              top: 12,
              maxWidth: Math.max(42, previewW * 0.18),
              maxHeight: Math.max(28, previewH * 0.1),
              objectFit: "contain",
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.65))",
              pointerEvents: "none",
              zIndex: 8,
            }}
          />
        )}

        {/* Timecode pill — isolated component so it re-renders each frame without pulling CanvasPreview along */}
        <TimecodePill />
      </div>
    </div>
  );
}

function CanvasWrapper({
  onCaptionClick,
  transportVideoRef,
}: {
  onCaptionClick?: (sceneId: string, captionId: string) => void;
  transportVideoRef?: { current: HTMLVideoElement | null };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      {size.w > 0 && (
        <CanvasPreview
          containerWidth={size.w}
          containerHeight={size.h}
          onCaptionClick={onCaptionClick}
          transportVideoRef={transportVideoRef}
        />
      )}
    </div>
  );
}

// ─── EditorShell ─────────────────────────────────────────────────────────────

interface EditorShellProps {
  projectId?: string;
  projectName?: string;
}

export default function EditorShell({
  projectId,
  projectName,
}: EditorShellProps) {
  const {
    isPlaying,
    currentTime,
    totalDuration,
    scenes,
    clips,
    play,
    pause,
    stop,
    seek,
    setActiveScene,
    projectName: storeName,
    setProjectName,
    isDirty,
    aspectRatio,
    zoom,
    leftTab,
    setLeftTab,
    audioTracks,
    undo,
    redo,
    past,
    future,
    loadTimeline,
  } = useEditorStore();

  const router = useRouter();
  const toast = useToast();

  // Panel sizing
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(320);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  // Right tab
  const [rightTab, setRightTab] = useState<"ai" | "inspector">("ai");

  // Project name editing
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(storeName);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");

  // Export
  const [exporting, setExporting] = useState(false);

  // Per-scene AI video generation progress
  const [genProgress, setGenProgress] = useState<Record<string, "generating" | "done" | "error">>({});
  const [genErrorSummary, setGenErrorSummary] = useState<string | null>(null);

  // Drag-resize
  const draggingRef = useRef<"left" | "right" | "timeline" | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; val: number }>({
    x: 0,
    y: 0,
    val: 0,
  });

  // Audio playback engine
  useAudioPlayback();

  // RAF playback
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const transportVideoRef = useRef<HTMLVideoElement | null>(null);
  const consumedEditorHandoffRef = useRef(false);
  const transportMouseDownHandledRef = useRef(false);

  const syncTransportVideo = useCallback((state: ReturnType<typeof useEditorStore.getState>) => {
    const video = transportVideoRef.current;
    const activeSceneId = state.scenes.some((scene) => scene.id === state.activeSceneId)
      ? state.activeSceneId
      : state.scenes[0]?.id ?? null;
    if (!video || !activeSceneId) return;

    if (activeSceneId !== state.activeSceneId) {
      state.setActiveScene(activeSceneId);
    }

    let elapsed = 0;
    for (const scene of state.scenes) {
      if (scene.id === activeSceneId) break;
      elapsed += scene.duration;
    }

    const local = Math.max(0, state.currentTime - elapsed);
    const playbackRate = state.scenes.find((scene) => scene.id === activeSceneId)?.playbackRate ?? 1;
    video.playbackRate = playbackRate;
    if (Math.abs(video.currentTime - local * playbackRate) > 0.35) {
      video.currentTime = local * playbackRate;
    }
  }, []);

  const togglePlayback = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.isPlaying) {
      transportVideoRef.current?.pause();
      state.pause();
    } else {
      syncTransportVideo(state);
      if (transportVideoRef.current) {
        const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId) ?? state.scenes[0];
        if (activeScene?.muteVideoAudio !== true) {
          transportVideoRef.current.muted = false;
        }
        transportVideoRef.current.playbackRate = activeScene?.playbackRate ?? 1;
        void playMediaElement(transportVideoRef.current, { allowMutedFallback: true }).then((started) => {
          if (started) useEditorStore.getState().play();
        });
      } else {
        state.play();
      }
    }
  }, [syncTransportVideo]);

  const handleTransportMouseDown = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.style.transform = "scale(0.93)";
    transportMouseDownHandledRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    togglePlayback();
  }, [togglePlayback]);

  const handleTransportClick = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (transportMouseDownHandledRef.current) {
      transportMouseDownHandledRef.current = false;
      return;
    }
    togglePlayback();
  }, [togglePlayback]);

  const handleTransportKeyDown = useCallback((e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    togglePlayback();
  }, [togglePlayback]);

  useEffect(() => {
    if (projectName) setProjectName(projectName);
    if (projectId) useEditorStore.setState({ projectId });
  }, [projectId, projectName, setProjectName]);

  useEffect(() => {
    const raw = sessionStorage.getItem("vydeoai_pending_footage_editor");
    if (!raw) return;
    consumedEditorHandoffRef.current = true;
    sessionStorage.removeItem("vydeoai_pending_footage_editor");

    type PendingClip = {
      id: string;
      name: string;
      src: string;
      duration: number;
      thumbnail?: string;
    };
    type PendingPayload = {
      aspectRatio: AspectRatio;
      totalDuration: number;
      prompt?: string;
      scenes: Scene[];
      clips: PendingClip[];
    };

    let payload: PendingPayload | null = null;
    try {
      payload = JSON.parse(raw) as PendingPayload;
    } catch {
      return;
    }
    if (!payload) return;
    const requestedTransition = inferRequestedTransition(payload.prompt ?? "");
    const requestedColor = inferRequestedColorAdjustments(payload.prompt ?? "");
    const requestedColorGrade = inferRequestedColorGrade(payload.prompt ?? "");
    const clipById = new Map(payload.clips.map((clip) => [clip.id, clip] as const));
    const scenes = payload.scenes.map((scene, index) => ({
      ...scene,
      clipSrc: scene.clipSrc ?? (scene.clipId ? clipById.get(scene.clipId)?.src ?? null : null),
      clipType: scene.clipType ?? (scene.clipId ? "video" as const : null),
      transition: requestedTransition && index < payload.scenes.length - 1
        ? { ...scene.transition, type: requestedTransition }
        : scene.transition,
      colorGrade: requestedColorGrade ?? scene.colorGrade,
      colorAdjustments: requestedColor
        ? { ...scene.colorAdjustments, ...requestedColor }
        : scene.colorAdjustments,
    }));

    useEditorStore.setState((state) => ({
      ...state,
      clips: payload.clips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        src: clip.src,
        file: new File([], clip.name),
        type: "video" as const,
        duration: clip.duration,
        thumbnail: clip.thumbnail || undefined,
      })),
    }));

    useEditorStore.getState().loadTimeline({
      scenes,
      audioTracks: [],
      totalDuration: payload.totalDuration,
      aspectRatio: payload.aspectRatio,
    });
    useEditorStore.getState().setLeftTab("transitions");
  }, []);

  // ── Persistence: autosave + load via the drafts API ───────────────────────────
  const saveDraft = useCallback(async () => {
    const st = useEditorStore.getState();
    if (!st.projectId || st.projectId === "new") return;
    setSaveStatus("saving");
    try {
      await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: st.projectId,
          name: st.projectName,
          aspectRatio: st.aspectRatio,
          currentPlayhead: st.currentTime,
          timelineData: {
            scenes: st.scenes,
            // Drop the non-serializable File handle; blob srcs don't survive reload anyway.
            audioTracks: st.audioTracks.map((t) => ({ ...t, file: undefined })),
            totalDuration: st.totalDuration,
          },
        }),
      });
      useEditorStore.setState({ isDirty: false });
    } catch {
      // Leave isDirty set so the next change retries; never block the editor.
    } finally {
      setSaveStatus("saved");
    }
  }, []);

  // Load a previously-saved draft for this project — skipped when arriving fresh from
  // the workspace handoff (which seeds its own timeline via sessionStorage).
  useEffect(() => {
    if (!projectId || projectId === "new") return;
    if (consumedEditorHandoffRef.current) return;
    if (PENDING_EDITOR_HANDOFF_KEYS.some((key) => sessionStorage.getItem(key))) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/drafts/${projectId}`);
        if (!res.ok) return;
        const { draft } = await res.json();
        const t = draft?.timelineData;
        if (!cancelled && t?.scenes?.length) {
          loadTimeline({ scenes: t.scenes, audioTracks: t.audioTracks ?? [], totalDuration: t.totalDuration ?? 0, aspectRatio: draft.aspect_ratio });
        }
      } catch {
        /* keep the current timeline on any error */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Debounced autosave whenever the timeline changes.
  useEffect(() => {
    if (!projectId || projectId === "new" || !isDirty) return;
    const handle = setTimeout(() => { saveDraft(); }, 1500);
    return () => clearTimeout(handle);
  }, [projectId, isDirty, scenes, audioTracks, aspectRatio, saveDraft]);

  // Auto-generate AI videos for each scene when coming from workspace with no uploaded clips
  useEffect(() => {
    const raw = sessionStorage.getItem("vydeoai_pending_video_gen");
    if (!raw) return;
    sessionStorage.removeItem("vydeoai_pending_video_gen");

    type PendingScene = Pick<Scene, "id" | "order" | "label" | "description" | "duration" | "captions" | "transition" | "mood" | "colorGrade" | "colorAdjustments" | "effects" | "muteVideoAudio"> & {
      clipId?: string | null;
      clipSrc?: string | null;
      clipType?: Scene["clipType"];
    };
    type LegacyPendingScene = { id: string; label: string; description: string; duration: number; mood: string };
    type Payload = { aspectRatio: string; totalDuration?: number; prompt?: string; referenceImage?: string | null; scenes: Array<PendingScene | LegacyPendingScene> };
    let payload: Payload;
    try { payload = JSON.parse(raw) as Payload; } catch { return; }

    const { aspectRatio: ar } = payload;
    const pendingScenes: Scene[] = payload.scenes.map((scene, index) => {
      const full = scene as PendingScene;
      return {
        id: scene.id,
        order: full.order ?? index,
        label: scene.label,
        description: scene.description,
        duration: scene.duration,
        clipId: full.clipId ?? null,
        clipSrc: full.clipSrc ?? null,
        clipType: full.clipType ?? null,
        captions: full.captions ?? [],
        transition: full.transition ?? { type: "fade", duration: 0.5 },
        mood: (scene.mood as Mood) ?? "neutral",
        colorGrade: full.colorGrade ?? null,
        colorAdjustments: full.colorAdjustments ?? {
          exposure: 0,
          contrast: 0,
          saturation: 0,
          temperature: 0,
          tint: 0,
          highlights: 0,
          shadows: 0,
        },
        effects: full.effects ?? [],
        muteVideoAudio: full.muteVideoAudio,
      };
    });

    useEditorStore.getState().loadTimeline({
      scenes: pendingScenes,
      audioTracks: [],
      totalDuration: payload.totalDuration ?? pendingScenes.reduce((sum, scene) => sum + scene.duration, 0),
      aspectRatio: ar as AspectRatio,
    });

    // Mark all as generating
    const initial: Record<string, "generating" | "done" | "error"> = {};
    pendingScenes.forEach(s => { initial[s.id] = "generating"; });
    setGenProgress(initial);
    setGenErrorSummary(null);

    // Generate scenes sequentially. Vertex/Veo projects often have low concurrent
    // long-running-operation limits; launching every scene at once can make all
    // of them fail together with quota/resource errors.
    void (async () => {
      let firstError: string | null = null;
      for (const scene of pendingScenes) {
        try {
          const res = await fetch("/api/generate-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: buildSceneVideoPrompt(scene, {
                originalBrief: payload.prompt,
                aspectRatio: ar,
                sceneIndex: pendingScenes.findIndex((item) => item.id === scene.id),
                totalScenes: pendingScenes.length,
              }),
              duration: String(scene.duration),
              aspectRatio: ar,
              motion: "cinematic slow motion",
              style: `${scene.mood} premium startup commercial, realistic phone UI, clean corporate ad`,
              referenceImage: payload.referenceImage ?? undefined,
              audio: true,
            }),
          });
          const data = await res.json() as { videoUrl?: string; url?: string; error?: string };
          if (res.ok === false) throw new Error(data.error ?? `Video generation failed with HTTP ${res.status}`);

          const rawUrl = data.videoUrl ?? data.url ?? null;
          if (!rawUrl) throw new Error(data.error ?? "Video generation returned no video URL");

          // Convert data URL to blob URL for memory efficiency
          let videoSrc = rawUrl;
          if (rawUrl.startsWith("data:")) {
            const [meta, b64] = rawUrl.split(",");
            const mime = meta.replace("data:", "").replace(";base64", "");
            const bytes = atob(b64);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            videoSrc = URL.createObjectURL(new Blob([arr], { type: mime }));
          }
          const clipId = crypto.randomUUID();
          const store = useEditorStore.getState();
          store.addClip({ id: clipId, name: scene.label, src: videoSrc, file: new File([], scene.label), type: "video", duration: scene.duration });
          store.assignClip(clipId, scene.id);
          const refreshed = useEditorStore.getState();
          const activeScene = refreshed.scenes.find((item) => item.id === refreshed.activeSceneId) ?? null;
          if (!activeScene?.clipSrc) {
            refreshed.setActiveScene(scene.id);
          }
          setGenProgress(p => ({ ...p, [scene.id]: "done" }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Video generation failed";
          firstError ??= message;
          setGenErrorSummary(message);
          setGenProgress(p => ({ ...p, [scene.id]: "error" }));
        }
      }
      if (firstError) {
        toast.error(firstError);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-order the uploaded clips per the user's prompt (Gemini), in the background.
  // The clips are ALREADY on the timeline (built in the workspace) so the preview shows
  // video immediately; this only re-sequences them and applies the AI transitions/grade.
  useEffect(() => {
    const flag = sessionStorage.getItem("vydeoai_pending_clip_assign");
    if (!flag) return;
    sessionStorage.removeItem("vydeoai_pending_clip_assign");
    let userPrompt = "";
    try { userPrompt = (JSON.parse(flag) as { prompt?: string }).prompt ?? ""; } catch { /* legacy flag */ }
    const requestedTransition = inferRequestedTransition(userPrompt);
    const requestedColor = inferRequestedColorAdjustments(userPrompt);
    const requestedColorGrade = inferRequestedColorGrade(userPrompt);

    const timer = setTimeout(async () => {
      try {
        const store = useEditorStore.getState();
        const videoClips = store.clips.filter((c) => c.type === "video");
        if (store.scenes.length < 2 || videoClips.length < 2) return; // nothing meaningful to re-order

        // Sample frames from each clip so Gemini can identify their content.
        type ClipInfo = { index: number; name: string; duration: number; frames?: string[] };
        const clipInfos: ClipInfo[] = await Promise.all(
          videoClips.map(async (clip, i): Promise<ClipInfo> => {
            try {
              const vid = document.createElement("video");
              vid.src = clip.src; vid.preload = "metadata"; vid.muted = true;
              await new Promise<void>((resolve) => {
                vid.onloadeddata = () => resolve();
                vid.onerror = () => resolve();
                setTimeout(resolve, 3000);
              });
              const dur = vid.duration || clip.duration || 5;
              const canvas = document.createElement("canvas");
              canvas.width = 320; canvas.height = 568;
              const ctx = canvas.getContext("2d");
              const frames: string[] = [];
              for (const t of [dur * 0.1, dur * 0.5, dur * 0.9]) {
                await new Promise<void>((res) => {
                  vid.currentTime = t;
                  vid.onseeked = () => { try { ctx?.drawImage(vid, 0, 0, 320, 568); frames.push(canvas.toDataURL("image/jpeg", 0.6)); } catch { /* */ } res(); };
                  setTimeout(res, 1000);
                });
              }
              return { index: i, name: clip.name, duration: dur, frames };
            } catch {
              return { index: i, name: clip.name, duration: clip.duration || 5 };
            }
          })
        );

        // Ask Gemini to order/edit the clips per the user's prompt.
        let plan: {
          sceneOrder?: number[];
          transitions?: Array<{ afterClipIndex: number; type: string; duration: number }>;
          globalColorAdjustments?: Scene["colorAdjustments"];
          muteSourceAudio?: boolean;
        } | null = null;
        try {
          const res = await fetch("/api/edit-footage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: userPrompt || "Order these clips into one cohesive, well-paced video.",
              clips: clipInfos,
            }),
          });
          if (res.ok) plan = (await res.json()).plan;
        } catch { /* keep current order */ }
        if (!plan?.sceneOrder?.length) return;

        // Re-sequence the existing clip-scenes to match Gemini's clip order (video stays loaded).
        const fresh = useEditorStore.getState();
        const sceneByClipId = new Map(fresh.scenes.map((s) => [s.clipId, s] as const));
        const used = new Set<string>();
        const reordered: typeof fresh.scenes = [];
        for (const clipIdx of plan.sceneOrder) {
          const clip = videoClips[clipIdx];
          if (!clip) continue;
          const sc = sceneByClipId.get(clip.id);
          if (sc && !used.has(sc.id)) { reordered.push(sc); used.add(sc.id); }
        }
        for (const s of fresh.scenes) if (!used.has(s.id)) reordered.push(s); // keep any leftover
        if (reordered.length !== fresh.scenes.length) return; // safety: never drop scenes

        const transitionByClip = new Map<number, { type: string; duration: number }>();
        for (const t of plan.transitions ?? []) transitionByClip.set(t.afterClipIndex, { type: t.type, duration: t.duration });
        const clipIndexById = new Map(videoClips.map((c, i) => [c.id, i] as const));
        const globalColor = plan.globalColorAdjustments ?? null;
        const muteAudio = plan.muteSourceAudio === true;

        const final = reordered.map((s, i): Scene => {
          const ci = s.clipId ? clipIndexById.get(s.clipId) : undefined;
          const trans = ci != null ? transitionByClip.get(ci) : undefined;
          const transitionType = trans?.type as TransitionType | undefined;
          return {
            ...s,
            order: i,
            transition: i < reordered.length - 1 && requestedTransition
              ? { type: requestedTransition, duration: Math.max(0.1, Math.min(2, trans?.duration ?? 0.8)) }
              : i < reordered.length - 1 && transitionType && FOOTAGE_TRANSITIONS.has(transitionType)
                ? { type: transitionType, duration: Math.max(0.1, Math.min(2, trans?.duration ?? 0.8)) }
              : i === reordered.length - 1
                ? { type: "cut", duration: 0.1 }
                : s.transition,
            colorAdjustments: globalColor || requestedColor
              ? { ...s.colorAdjustments, ...(globalColor ?? {}), ...(requestedColor ?? {}) }
              : s.colorAdjustments,
            colorGrade: requestedColorGrade ?? s.colorGrade,
            muteVideoAudio: muteAudio || s.muteVideoAudio,
          };
        });

        useEditorStore.getState().loadTimeline({
          scenes: final,
          audioTracks: fresh.audioTracks,
          totalDuration: final.reduce((a, s) => a + s.duration, 0),
          aspectRatio: fresh.aspectRatio,
        });
      } catch {
        /* keep the current clip timeline on any error */
      }
    }, 800);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Auto-generation removed — user uploads or refines via AI chat)

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
      return;
    }
    const tick = (now: number) => {
      if (lastTickRef.current !== null) {
        const delta = (now - lastTickRef.current) / 1000;
        const store = useEditorStore.getState();
        const next = store.currentTime + delta;
        if (next >= store.totalDuration) {
          stop();
          return;
        }
        store.seek(next);
        let elapsed = 0;
        for (const scene of store.scenes) {
          if (next < elapsed + scene.duration) {
            if (scene.id !== store.activeSceneId)
              store.setActiveScene(scene.id);
            break;
          }
          elapsed += scene.duration;
        }
      }
      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    lastTickRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, stop]);

  useEffect(() => {
    const { activeSceneId, scenes: s } = useEditorStore.getState();
    if (!activeSceneId && s.length > 0) setActiveScene(s[0].id);
  }, [setActiveScene]);

  useEffect(() => {
    const store = useEditorStore.getState();
    const hasAssignedMedia = store.scenes.some((scene) => !!scene.clipId || !!scene.clipSrc);
    if (hasAssignedMedia || store.clips.length === 0) return;

    const availableClips = store.clips.filter(
      (clip) => !store.scenes.some((scene) => scene.clipId === clip.id)
    );
    const emptyScenes = store.scenes.filter((scene) => !scene.clipId && !scene.clipSrc);
    if (availableClips.length === 0 || emptyScenes.length === 0) return;

    emptyScenes.slice(0, availableClips.length).forEach((scene, index) => {
      store.assignClip(availableClips[index].id, scene.id);
    });

    const refreshed = useEditorStore.getState();
    const activeScene = refreshed.scenes.find((scene) => scene.id === refreshed.activeSceneId) ?? null;
    if (!activeScene?.clipSrc) {
      refreshed.setActiveScene(emptyScenes[0].id);
    }
  }, [clips, scenes, setActiveScene]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayback();
      }
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveDraft();
      }
      if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.key === "z" && (e.metaKey || e.ctrlKey) && e.shiftKey) || (e.key === "y" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        redo();
      }
      if (e.key === "Escape") {
        useEditorStore.setState({ activeSceneId: null, inspectorTarget: null });
      }
      // J/K/L — JKL transport (industry standard)
      if (e.key === "j") { e.preventDefault(); seek(Math.max(0, useEditorStore.getState().currentTime - 5)); }
      if (e.key === "l") { e.preventDefault(); seek(Math.min(totalDuration, useEditorStore.getState().currentTime + 5)); }
      if (e.key === "k" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); togglePlayback(); }
      // Arrow keys — frame-by-frame
      if (e.key === "ArrowLeft") { e.preventDefault(); seek(Math.max(0, useEditorStore.getState().currentTime - 1/24)); }
      if (e.key === "ArrowRight") { e.preventDefault(); seek(Math.min(totalDuration, useEditorStore.getState().currentTime + 1/24)); }
      // Home / End
      if (e.key === "Home") { e.preventDefault(); seek(0); }
      if (e.key === "End") { e.preventDefault(); seek(totalDuration); }
      // ⌘K — open AI chat
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setRightCollapsed(false);
        setRightTab("ai");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, saveDraft, seek, togglePlayback, totalDuration, undo]);

  // Drag-resize mouse handlers
  const onMouseMove = useCallback((e: MouseEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    if (d === "left") {
      const delta = e.clientX - dragStartRef.current.x;
      setLeftWidth(Math.max(200, Math.min(480, dragStartRef.current.val + delta)));
    } else if (d === "right") {
      const delta = dragStartRef.current.x - e.clientX;
      setRightWidth(Math.max(220, Math.min(480, dragStartRef.current.val + delta)));
    } else if (d === "timeline") {
      const delta = dragStartRef.current.y - e.clientY;
      setTimelineHeight(
        Math.max(160, Math.min(700, dragStartRef.current.val + delta))
      );
    }
  }, []);

  const onMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  function startDrag(
    which: "left" | "right" | "timeline",
    e: ReactMouseEvent,
    val: number
  ) {
    draggingRef.current = which;
    dragStartRef.current = { x: e.clientX, y: e.clientY, val };
    e.preventDefault();
  }

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

  const buildRenderScene = async (scene: any) => {
  const clip = scene.clipId
    ? clips.find((item) => item.id === scene.clipId)
    : null;

  let clipData: string | null = null;
  let clipMime = "";
  let clipExt = "";

  // Helper: make sure the generated Data URL actually contains base64 data
  const validateDataUrl = (
    dataUrl: string | null,
    sceneName: string
  ) => {
    if (!dataUrl) {
      console.warn(
        `[Export] Scene "${sceneName}" has no media data; rendering will use a placeholder frame.`
      );
      return null;
    }

    const commaIndex = dataUrl.indexOf(",");

    if (commaIndex === -1) {
      console.warn(
        `[Export] Scene "${sceneName}" has an invalid media Data URL; rendering will use a placeholder frame.`
      );
      return null;
    }

    const header = dataUrl.slice(0, commaIndex);
    const base64 = dataUrl.slice(commaIndex + 1);

    if (!header.includes(";base64")) {
      console.warn(
        `[Export] Scene "${sceneName}" media is not base64 encoded; rendering will use a placeholder frame.`
      );
      return null;
    }

    if (!base64.trim()) {
      console.warn(
        `[Export] Scene "${sceneName}" media file is empty; rendering will use a placeholder frame.`
      );
      return null;
    }

    return dataUrl;
  };

  const clipSrc = scene.clipSrc ?? clip?.src ?? null;

  // ---------------------------------------------------------
  // 1. Prefer original File object
  // ---------------------------------------------------------

  if (clip?.file instanceof File && clip.file.size > 0) {
    console.log("[Export] Using original file:", {
      scene: scene.label,
      name: clip.file.name,
      type: clip.file.type,
      size: clip.file.size,
    });

    clipMime =
      clip.file.type ||
      (scene.clipType === "image"
        ? "image/jpeg"
        : "video/mp4");

    clipExt =
      clip.file.name
        .split(".")
        .pop()
        ?.toLowerCase() ||
      (scene.clipType === "image"
        ? "jpg"
        : "mp4");

    clipData = await fileToDataUrl(
      clip.file
    );
  } else if (clip?.file instanceof File && clip.file.size === 0) {
    if (clipSrc) {
      console.warn(
        `[Export] Skipping empty placeholder file for scene "${scene.label}" and falling back to clipSrc/clip.src.`
      );
    } else {
      throw new Error(
        `Scene "${scene.label}" has no media data because its placeholder file is empty and no clipSrc/clip.src fallback is available.`
      );
    }
  }

  // ---------------------------------------------------------
  // 2. Otherwise fetch scene.clipSrc or clip.src
  // ---------------------------------------------------------

  if (!clipData && clipSrc) {
    if (String(clipSrc).startsWith("http://") || String(clipSrc).startsWith("https://") || String(clipSrc).startsWith("gs://")) {
      console.log(
        "[Export] Remote media URL found — skipping browser download, server will fetch directly:",
        {
          scene: scene.label,
          src: String(clipSrc).slice(0, 100),
        }
      );
      // Keep clipData null so the payload stays light, server will fetch it!
    } else {
      console.log(
        "[Export] Fetching local blob/media in browser:",
        {
          scene: scene.label,
          src: String(clipSrc).slice(0, 100),
        }
      );

      let response = null;
      try {
        response = await fetch(clipSrc);
      } catch (err) {
        console.warn(
          `[Export] Network error fetching media for scene "${scene.label}":`, err
        );
      }

      if (!response || !response.ok) {
        console.warn(
          `[Export] Could not fetch media for scene "${scene.label}".${response ? ` HTTP ${response.status}` : ""} Rendering will use a placeholder frame.`
        );
        clipData = null;
      } else {
        const blob =
          await response.blob();

        if (blob.size === 0) {
          console.warn(
            `[Export] Scene "${scene.label}" returned an empty media file; rendering will use a placeholder frame.`
          );
          clipData = null;
        } else {
          console.log(
            "[Export] Media fetched:",
            {
              scene: scene.label,
              size: blob.size,
              type: blob.type,
            }
          );

          clipMime =
            blob.type ||
            (scene.clipType === "image"
              ? "image/jpeg"
              : "video/mp4");

          clipExt =
            getExtensionFromUrl(
              scene.clipSrc
            ) ||
            (clipMime.includes("image")
              ? "jpg"
              : clipMime.includes("webm")
                ? "webm"
                : "mp4");

          clipData =
            await blobToDataUrl(blob);
        }
      }
    }
  }

  // ---------------------------------------------------------
  // 4. Validate REAL base64 payload
  // ---------------------------------------------------------

  if (clipData !== null) {
    clipData = validateDataUrl(
      clipData,
      scene.label
    );
  }

  console.log(
    "[Export] Scene ready:",
    {
      scene: scene.label,

      clipType:
        scene.clipType ??
        clip?.type ??
        "video",

      clipMime,

      clipExt,

      dataUrlLength:
        clipData?.length ?? 0,

      dataPrefix:
        clipData?.slice(0, 50) ?? "",
    }
  );

  // ---------------------------------------------------------
  // 5. Return render scene
  // ---------------------------------------------------------

  return {
    id: scene.id,

    label: scene.label,

    duration:
      Number(scene.duration) || 1,

    clipType:
      scene.clipType ??
      clip?.type ??
      "video",

    clipMime:
      clipMime ||
      undefined,

    clipExt:
      clipExt ||
      undefined,

    clipSrc:
      scene.clipSrc ??
      clip?.src ??
      undefined,

    clipData: clipData ?? undefined,

    playbackSpeed:
      scene.playbackRate ?? 1,

    clipTrimStart:
      scene.clipTrimStart,

    clipTrimEnd:
      scene.clipTrimEnd,

    visualEffect:
      scene.visualEffect,

    transition:
      scene.transition,

    captions:
      scene.captions?.map(
        (caption: any) => ({
          text:
            caption.text,

          startTime:
            caption.startTime,

          endTime:
            caption.endTime,

          fontFamily:
            caption.fontFamily,

          fontSize:
            caption.fontSize,

          color:
            caption.color,

          bgColor:
            caption.bgColor,

          bgOpacity:
            caption.bgOpacity,

          bold:
            caption.bold,

          x:
            caption.x,

          y:
            caption.y,

          align:
            caption.align,
        })
      ) ?? [],
  };
};

  const handleExport = async () => {
    try {
      setExporting(true);
      const payloadScenes = await Promise.all(scenes.map(buildRenderScene));
      if (!payloadScenes.some((scene) => scene.clipData || scene.clipSrc)) {
        toast.error("No media found to export.");
        return;
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
        totalDuration: payloadScenes.reduce((sum, scene) => sum + scene.duration, 0),
        outputFilename: `${storeName.replace(/\s+/g, "-")}-${Date.now()}.mp4`,
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
        throw new Error(errorBody.error ?? errorBody.message ?? "Export failed. Please try again.");
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.startsWith("video/")) {
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${storeName.replace(/\s+/g, "-")}-${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        toast.success("Export ready — downloading now.");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!data.downloadUrl) {
        throw new Error(data.error ?? data.message ?? "Export failed. Please try again.");
      }

      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename ?? `${storeName.replace(/\s+/g, "-")}-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Export ready — downloading now.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[export]", error);
      toast.error(message || "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const actualLeftWidth = leftCollapsed ? 48 : leftWidth;
  const actualRightWidth = rightCollapsed ? 0 : rightWidth;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        gridTemplateAreas: `"topbar topbar topbar" "left canvas right" "left timeline right"`,
        gridTemplateColumns: `${actualLeftWidth}px 1fr ${actualRightWidth}px`,
        gridTemplateRows: `52px 1fr ${timelineHeight}px`,
        width: "100vw",
        height: "100vh",
        background: "var(--bg-base)",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── TOP TOOLBAR ───────────────────────────────────────── */}
      <header
        style={{
          gridArea: "topbar",
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 6,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {/* Left cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconBtn
            title="Back to workspace"
            onClick={() => router.push("/workspace")}
          >
            <ArrowLeft size={15} />
          </IconBtn>
          <VDivider />
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={() => {
                setProjectName(nameVal);
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setProjectName(nameVal);
                  setEditingName(false);
                }
                if (e.key === "Escape") {
                  setNameVal(storeName);
                  setEditingName(false);
                }
              }}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-focus)",
                borderRadius: "var(--r-sm)",
                padding: "4px 9px",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                outline: "none",
                width: 200,
              }}
            />
          ) : (
            <button
              onClick={() => {
                setNameVal(storeName);
                setEditingName(true);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "text",
                padding: "4px 6px",
                borderRadius: "var(--r-sm)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                maxWidth: 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {storeName}
            </button>
          )}
          {/* Auto-save dot */}
          <div
            title={
              saveStatus === "saving" || isDirty ? "Saving…" : "All changes saved"
            }
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              flexShrink: 0,
              background:
                saveStatus === "saving" || isDirty
                  ? "var(--warning)"
                  : "var(--success)",
              boxShadow:
                saveStatus === "saving" || isDirty
                  ? "0 0 6px var(--warning)"
                  : "0 0 5px var(--success)",
              animation:
                saveStatus === "saving" || isDirty
                  ? "pulse-dot 1.2s ease infinite"
                  : "none",
            }}
          />
        </div>

        {/* Center cluster */}
        <div
          style={{
            flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          position: "relative",
          zIndex: 20,
          pointerEvents: "auto",
        }}
      >
          <IconBtn title="Skip to start" onClick={() => seek(0)}>
            <SkipBack size={15} />
          </IconBtn>
          <IconBtn
            title="Step back"
            onClick={() => seek(Math.max(0, currentTime - 1 / 30))}
          >
            <ChevronLeft size={14} />
          </IconBtn>
          <button
            type="button"
            onClick={handleTransportClick}
            onMouseDown={handleTransportMouseDown}
            onKeyDown={handleTransportKeyDown}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "var(--glow-accent)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.12s, transform 0.1s",
              position: "relative",
              zIndex: 30,
              pointerEvents: "auto",
              touchAction: "manipulation",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent)";
              e.currentTarget.style.transform = "scale(1)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {isPlaying ? (
              <Pause size={16} style={{ color: "#fff", pointerEvents: "none" }} />
            ) : (
              <Play size={16} style={{ color: "#fff", marginLeft: 2, pointerEvents: "none" }} />
            )}
          </button>
          <IconBtn
            title="Step forward"
            onClick={() =>
              seek(Math.min(totalDuration, currentTime + 1 / 30))
            }
          >
            <ChevronRight size={14} />
          </IconBtn>
          <IconBtn title="Skip to end" onClick={() => seek(totalDuration)}>
            <SkipForward size={15} />
          </IconBtn>
          <VDivider />
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "var(--text-secondary)",
              letterSpacing: "0.04em",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
          <div
            style={{
              padding: "2px 7px",
              borderRadius: "var(--r-full)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              letterSpacing: "0.04em",
              flexShrink: 0,
            }}
          >
            24 fps
          </div>
        </div>

        {/* Right cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconBtn title="Undo (⌘Z)" onClick={undo} disabled={past.length === 0}>
            <Undo2 size={14} />
          </IconBtn>
          <IconBtn title="Redo (⌘⇧Z)" onClick={redo} disabled={future.length === 0}>
            <Redo2 size={14} />
          </IconBtn>
          <VDivider />
          <div
            style={{
              padding: "4px 10px",
              borderRadius: "var(--r-sm)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {Math.round(zoom * 100)}%
          </div>
          <VDivider />
          <button
            onClick={() => { setRightCollapsed(false); setRightTab("ai"); }}
            title="Open AI Assistant (⌘K)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: "var(--r-md)",
              fontSize: 12,
              fontWeight: 600,
              background: "rgba(139,92,246,0.12)",
              color: "var(--ai-light)",
              border: "1px solid rgba(139,92,246,0.25)",
              cursor: "pointer",
              transition: "all 0.12s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(139,92,246,0.2)";
              e.currentTarget.style.borderColor = "rgba(139,92,246,0.45)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(139,92,246,0.12)";
              e.currentTarget.style.borderColor = "rgba(139,92,246,0.25)";
            }}
          >
            <Sparkles size={13} />
            AI
            <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 500 }}>⌘K</span>
          </button>
          <VDivider />
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: "var(--r-md)",
              fontSize: 12,
              fontWeight: 600,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
              cursor: exporting ? "not-allowed" : "pointer",
              opacity: exporting ? 0.7 : 1,
              transition: "background 0.12s, opacity 0.12s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (!exporting)
                e.currentTarget.style.background = "var(--accent-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent)";
            }}
          >
            <Download size={13} />
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </header>

      {/* ── LEFT PANEL ──────────────────────────────────────────── */}
      <motion.div
        layout
        style={{
          gridArea: "left",
          display: "flex",
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border)",
          overflow: "hidden",
          height: "100%",
          position: "relative",
        }}
      >
        {/* Icon rail */}
        <div
          style={{
            width: 48,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            paddingTop: 8,
            borderRight: leftCollapsed
              ? "none"
              : "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {LEFT_TABS.map(({ id, label, Icon }) => {
            const active = leftTab === id && !leftCollapsed;
            return (
              <button
                key={id}
                title={label}
                onClick={() => {
                  if (leftCollapsed) {
                    setLeftCollapsed(false);
                    setLeftTab(id);
                  } else if (leftTab === id) {
                    setLeftCollapsed(true);
                  } else {
                    setLeftTab(id);
                  }
                }}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "var(--r-md)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: active ? "var(--accent-subtle)" : "transparent",
                  border: active
                    ? "1px solid var(--accent-border)"
                    : "1px solid transparent",
                  cursor: "pointer",
                  gap: 2,
                  color: active ? "var(--accent-light)" : "var(--text-tertiary)",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-tertiary)";
                  }
                }}
              >
                <Icon size={15} />
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    lineHeight: 1,
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            title={leftCollapsed ? "Expand panel" : "Collapse panel"}
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--r-sm)",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              color: "var(--text-tertiary)",
              transition: "all 0.12s",
            }}
          >
            <ChevronLeft
              size={11}
              style={{
                transform: leftCollapsed ? "rotate(180deg)" : "none",
                transition: "transform 0.2s",
              }}
            />
          </button>
        </div>

        {/* Panel content */}
        <AnimatePresence initial={false}>
          {!leftCollapsed && (
            <motion.div
              key="left-content"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: leftWidth - 48, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              style={{
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              <div
                style={{
                  padding: "10px 14px 8px",
                  borderBottom: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {LEFT_TABS.find((t) => t.id === leftTab)?.label}
                </div>
              </div>
              <LeftPanelContent tab={leftTab} onOpenInspector={() => { setRightCollapsed(false); setRightTab("inspector"); }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Resize handle */}
        {!leftCollapsed && (
          <div
            onMouseDown={(e) => startDrag("left", e, leftWidth)}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 4,
              cursor: "col-resize",
              zIndex: 5,
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          />
        )}
      </motion.div>

      {/* ── CANVAS ──────────────────────────────────────────────── */}
      <div
        style={{
          gridArea: "canvas",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <CanvasWrapper
          onCaptionClick={() => { setRightCollapsed(false); setRightTab("inspector"); }}
          transportVideoRef={transportVideoRef}
        />

        {/* AI video generation progress banner */}
        {Object.keys(genProgress).length > 0 && (
          <div style={{
            position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
            background: "rgba(10,10,13,0.92)", backdropFilter: "blur(12px)",
            border: "1px solid var(--accent-border)", borderRadius: "var(--r-lg)",
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 12,
            zIndex: 20, pointerEvents: "none", minWidth: 260,
          }}>
            {(() => {
              const total = Object.keys(genProgress).length;
              const done = Object.values(genProgress).filter(v => v === "done").length;
              const errors = Object.values(genProgress).filter(v => v === "error").length;
              const generating = total - done - errors;
              return (
                <>
                  {generating > 0 ? (
                    <svg style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : errors > 0 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                      {generating > 0 ? `Generating AI video for ${generating} scene${generating > 1 ? "s" : ""}…` : errors > 0 ? `${done} of ${total} videos ready (${errors} failed)` : "All AI videos generated"}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {errors > 0 && genErrorSummary
                        ? genErrorSummary.slice(0, 120)
                        : generating > 0
                          ? "This can take up to 5 min per scene via Veo 3"
                          : "Videos assigned to timeline scenes"}
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
                    {Object.values(genProgress).map((v, i) => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: v === "done" ? "#10B981" : v === "error" ? "#EF4444" : "var(--accent)" }} />
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── TIMELINE ────────────────────────────────────────────── */}
      <div
        style={{
          gridArea: "timeline",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Resize handle */}
        <div
          onMouseDown={(e) => startDrag("timeline", e, timelineHeight)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            cursor: "row-resize",
            zIndex: 5,
            background: "transparent",
            borderTop: "1px solid var(--border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--accent-border)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        />
        <TimelinePanel
          height={timelineHeight}
          onHeightChange={setTimelineHeight}
          isExpanded={timelineExpanded}
          onExpandToggle={() => setTimelineExpanded((v) => !v)}
        />
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!rightCollapsed && (
          <motion.div
            key="right-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{
              gridArea: "right",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-panel)",
              borderLeft: "1px solid var(--border)",
              overflow: "hidden",
              height: "100%",
              position: "relative",
              width: rightWidth,
            }}
          >
            {/* Tab bar */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
                height: 40,
                alignItems: "stretch",
              }}
            >
              {(["ai", "inspector"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  style={{
                    flex: 1,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "capitalize",
                    letterSpacing: "0.04em",
                    background:
                      rightTab === tab ? "var(--accent-subtle)" : "transparent",
                    color:
                      rightTab === tab
                        ? "var(--accent-light)"
                        : "var(--text-tertiary)",
                    borderBottom:
                      rightTab === tab
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                    transition: "all 0.12s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                  }}
                >
                  {tab === "ai" ? (
                    <Sparkles size={11} />
                  ) : (
                    <ZoomIn size={11} />
                  )}
                  {tab === "ai" ? "AI" : "Inspector"}
                </button>
              ))}
              <button
                onClick={() => setRightCollapsed(true)}
                title="Collapse panel"
                style={{
                  width: 36,
                  border: "none",
                  cursor: "pointer",
                  flexShrink: 0,
                  background: "transparent",
                  color: "var(--text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderLeft: "1px solid var(--border)",
                }}
              >
                <ChevronRight size={12} />
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {rightTab === "ai" && <AIChatPanel />}
              {rightTab === "inspector" && (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <InspectorContent />
                </div>
              )}
            </div>

            {/* Resize handle */}
            <div
              onMouseDown={(e) => startDrag("right", e, rightWidth)}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                cursor: "col-resize",
                zIndex: 5,
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent-border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right panel re-open tab */}
      {rightCollapsed && (
        <button
          onClick={() => setRightCollapsed(false)}
          title="Open side panel"
          style={{
            position: "fixed",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 20,
            width: 24,
            height: 56,
            borderRadius: "var(--r-md)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-tertiary)",
          }}
        >
          <ChevronLeft size={12} />
        </button>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes zoomOutEnter {
          from { transform: scale(1.18); }
          to   { transform: scale(1); }
        }
        @keyframes zoomInEnter {
          from { transform: scale(0.82); }
          to   { transform: scale(1); }
        }
        @keyframes fadeEnter {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideLeftEnter {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes slideRightEnter {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        @keyframes whipEnter {
          from { transform: translateX(60%) scaleX(0.7); opacity: 0.6; }
          to   { transform: translateX(0) scaleX(1); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
