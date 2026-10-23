"use client";

import { useRef, useState, useEffect } from "react";
import { useEditorStore, type BrandKit, type BrandLogoOverlay } from "@/store/editorStore";
import { v4 as uuidv4 } from "uuid";

const FONTS = [
  "Inter", "Playfair Display", "Cormorant Garamond", "DM Serif Display",
  "Montserrat", "Bebas Neue", "Georgia", "Space Grotesk", "Lora", "Poppins",
];

const DEFAULT_OVERLAY: BrandLogoOverlay = {
  enabled: true,
  type: "image",
  x: 75,
  y: 80,
  width: 20,
  opacity: 0.85,
  tintColor: null,
};

const DEFAULT_KIT: BrandKit = {
  id: "default-brand",
  name: "My Brand",
  logo: null,
  primaryColor: "#C9A96E",
  secondaryColor: "#1A1A22",
  accentColor: "#A78BFA",
  fontHeading: "Playfair Display",
  fontBody: "Inter",
  captionStyle: {},
  watermark: null,
  intro: null,
  outro: null,
  logoOverlay: DEFAULT_OVERLAY,
};

const LS_KEY_KITS = "vydeoai_brand_kits_v1";
const LS_KEY_ACTIVE = "vydeoai_brand_active_v1";

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label style={{
          width: 34, height: 30, borderRadius: "var(--r-sm)",
          background: value, border: "1px solid var(--border-strong)",
          cursor: "pointer", overflow: "hidden", position: "relative", flexShrink: 0,
        }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ position: "absolute", inset: -4, opacity: 0, cursor: "pointer", width: "140%", height: "140%" }} />
        </label>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          style={{
            flex: 1, background: "var(--bg-inset)", border: "1px solid var(--border)",
            borderRadius: "var(--r-xs)", padding: "5px 8px", fontSize: 11,
            color: "var(--text-primary)", fontFamily: "var(--font-mono)", outline: "none",
          }}
        />
      </div>
    </div>
  );
}

export default function BrandTab() {
  const { brandKit, setBrandKit, updateBrandKit, setInspectorTarget } = useEditorStore();
  const logoRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [kitsList, setKitsList] = useState<BrandKit[]>([DEFAULT_KIT]);
  const [activeKitId, setActiveKitId] = useState<string>(DEFAULT_KIT.id);
  const [localKit, setLocalKit] = useState<BrandKit>(brandKit ?? DEFAULT_KIT);

  // 1. Fetch saved brand kits from backend MongoDB API on mount
  useEffect(() => {
    let cancelled = false;
    async function loadBackendKits() {
      try {
        const res = await fetch("/api/brand-kits");
        if (res.ok) {
          const { kits: backendKits } = await res.json();
          if (!cancelled && Array.isArray(backendKits) && backendKits.length > 0) {
            const mapped: BrandKit[] = backendKits.map((bk: any) => {
              let overlay = DEFAULT_OVERLAY;
              if (bk.logo_overlay) {
                try {
                  overlay = typeof bk.logo_overlay === "string" ? JSON.parse(bk.logo_overlay) : bk.logo_overlay;
                } catch {}
              }
              return {
                id: bk.id,
                name: bk.name || "Brand Kit",
                logo: bk.logo || null,
                primaryColor: bk.primary_color || "#C9A96E",
                secondaryColor: bk.secondary_color || "#1A1A22",
                accentColor: bk.accent_color || "#A78BFA",
                fontHeading: bk.font_heading || "Playfair Display",
                fontBody: bk.font_body || "Inter",
                captionStyle: {},
                watermark: null,
                intro: null,
                outro: null,
                logoOverlay: overlay,
              };
            });

            setKitsList(mapped);
            
            // Choose active kit: store's brandKit > stored active ID > first kit
            const storedActiveId = localStorage.getItem(LS_KEY_ACTIVE);
            const targetKit = (brandKit && mapped.find(k => k.id === brandKit.id))
              || (storedActiveId && mapped.find(k => k.id === storedActiveId))
              || mapped[0];

            if (targetKit) {
              setActiveKitId(targetKit.id);
              setLocalKit(targetKit);
              setBrandKit(targetKit);
            }
            return;
          }
        }
      } catch (err) {
        console.warn("[BrandTab] Could not load backend brand kits:", err);
      }

      // Fallback: localStorage
      if (!cancelled) {
        try {
          const stored = localStorage.getItem(LS_KEY_KITS);
          if (stored) {
            const parsed = JSON.parse(stored) as any[];
            if (parsed.length > 0) {
              const mapped: BrandKit[] = parsed.map(k => ({
                id: k.id || uuidv4(),
                name: k.name || "Brand Kit",
                logo: k.logo || null,
                primaryColor: k.primary || k.primaryColor || "#C9A96E",
                secondaryColor: k.secondary || k.secondaryColor || "#1A1A22",
                accentColor: k.accent || k.accentColor || "#A78BFA",
                fontHeading: k.fontHeading || "Playfair Display",
                fontBody: k.fontBody || "Inter",
                captionStyle: {},
                watermark: null,
                intro: null,
                outro: null,
                logoOverlay: k.logoOverlay || DEFAULT_OVERLAY,
              }));
              setKitsList(mapped);
              setLocalKit(mapped[0]);
              setBrandKit(mapped[0]);
            }
          }
        } catch {}
      }
    }

    loadBackendKits();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store changes into localKit
  useEffect(() => {
    if (brandKit) {
      setLocalKit(brandKit);
      if (brandKit.id) setActiveKitId(brandKit.id);
    }
  }, [brandKit]);

  // Update local state and store immediately
  const update = (patch: Partial<BrandKit>) => {
    const updated = { ...localKit, ...patch };
    setLocalKit(updated);
    updateBrandKit(patch);
    setKitsList(prev => prev.map(k => k.id === updated.id ? updated : k));
  };

  const overlay: BrandLogoOverlay = localKit.logoOverlay ?? DEFAULT_OVERLAY;
  const updateOverlay = (patch: Partial<BrandLogoOverlay>) => {
    const updatedOverlay: BrandLogoOverlay = { ...overlay, ...patch };
    update({ logoOverlay: updatedOverlay });
  };

  // Switch active brand kit
  const handleSelectKit = (id: string) => {
    const found = kitsList.find(k => k.id === id);
    if (!found) return;
    setActiveKitId(id);
    setLocalKit(found);
    setBrandKit(found);
    try { localStorage.setItem(LS_KEY_ACTIVE, id); } catch {}
  };

  // Create brand kit
  const handleCreateKit = () => {
    const newKit: BrandKit = {
      id: uuidv4(),
      name: `Brand ${kitsList.length + 1}`,
      logo: null,
      primaryColor: "#38BDF8",
      secondaryColor: "#0F172A",
      accentColor: "#34D399",
      fontHeading: "Space Grotesk",
      fontBody: "Inter",
      captionStyle: {},
      watermark: null,
      intro: null,
      outro: null,
      logoOverlay: DEFAULT_OVERLAY,
    };
    const nextList = [...kitsList, newKit];
    setKitsList(nextList);
    setActiveKitId(newKit.id);
    setLocalKit(newKit);
    setBrandKit(newKit);
  };

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];

    // Optimistic local preview using Data URL (serializable & survives reload)
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        update({
          logo: reader.result,
          logoOverlay: {
            ...overlay,
            enabled: true,
            type: "image",
          },
        });
      }
    };
    reader.readAsDataURL(file);

    // Also attempt remote S3 upload for high-durability persistence
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const initRes = await fetch("/api/upload-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `brand_logo_${Date.now()}.${ext}`, contentType: file.type || "image/png" }),
      });
      if (initRes.ok) {
        const { url, publicUrl } = await initRes.json();
        await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "image/png" },
          body: file,
        });
        update({
          logo: publicUrl,
          logoOverlay: {
            ...overlay,
            enabled: true,
            type: "image",
          },
        });
      }
    } catch {
      // Fallback already active with Data URL
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const current = { ...localKit };
      const updatedList = kitsList.map(k => k.id === current.id ? current : k);

      // Persist to MongoDB backend
      await fetch("/api/brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveAll",
          kits: updatedList.map(k => ({
            ...k,
            primary: k.primaryColor,
            secondary: k.secondaryColor,
            accent: k.accentColor,
            logoOverlay: k.logoOverlay,
          })),
          activeId: current.id,
        }),
      });

      // Cache locally
      localStorage.setItem(LS_KEY_KITS, JSON.stringify(updatedList));
      localStorage.setItem(LS_KEY_ACTIVE, current.id);
      setBrandKit(current);

      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      console.warn("[BrandTab] Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const applyColorsToAllCaptions = () => {
    const { scenes, updateScene } = useEditorStore.getState();
    scenes.forEach(sc => {
      const updatedCaptions = sc.captions.map(cap => ({
        ...cap,
        fontFamily: localKit.fontBody,
        color: localKit.primaryColor,
        fontSize: (localKit.captionStyle as Record<string, number>)?.fontSize ?? cap.fontSize,
      }));
      updateScene(sc.id, { captions: updatedCaptions });
    });
  };

  const kit = localKit;

  return (
    <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Brand Kit Selector Dropdown */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Selected Brand Kit
          </div>
          <button
            onClick={handleCreateKit}
            style={{
              fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "transparent",
              border: "none", cursor: "pointer", padding: "0 2px"
            }}
          >
            + New Kit
          </button>
        </div>
        <select
          value={activeKitId}
          onChange={(e) => handleSelectKit(e.target.value)}
          style={{
            width: "100%", background: "var(--bg-inset)", border: "1px solid var(--border)",
            borderRadius: "var(--r-md)", padding: "7px 10px",
            fontSize: 12, fontWeight: 600, color: "var(--text-primary)", outline: "none",
            cursor: "pointer",
          }}
        >
          {kitsList.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name} {k.id === activeKitId ? "(Active)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Kit name input */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 5 }}>
          Brand Name
        </div>
        <input
          value={kit.name}
          onChange={e => update({ name: e.target.value })}
          placeholder="e.g. My Brand"
          style={{
            width: "100%", background: "var(--bg-inset)", border: "1px solid var(--border)",
            borderRadius: "var(--r-md)", padding: "7px 10px",
            fontSize: 12, fontWeight: 600, color: "var(--text-primary)", outline: "none",
            transition: "border-color 0.12s",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-dim)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
      </div>

      {/* Logo & Watermark Section */}
      <div style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", padding: "12px", display: "flex", flexDirection: "column", gap: 10
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Canvas Logo Watermark
          </div>
          {/* Logo Type Selector */}
          <div style={{ display: "flex", background: "var(--bg-inset)", borderRadius: 4, padding: 2, border: "1px solid var(--border)" }}>
            <button
              onClick={() => updateOverlay({ type: "image", enabled: true })}
              style={{
                fontSize: 10, padding: "2px 6px", border: "none", borderRadius: 3, cursor: "pointer",
                background: overlay.type === "image" ? "var(--accent)" : "transparent",
                color: overlay.type === "image" ? "#fff" : "var(--text-muted)", fontWeight: 600,
              }}
            >
              Image
            </button>
            <button
              onClick={() => updateOverlay({ type: "text", enabled: true })}
              style={{
                fontSize: 10, padding: "2px 6px", border: "none", borderRadius: 3, cursor: "pointer",
                background: overlay.type === "text" ? "var(--accent)" : "transparent",
                color: overlay.type === "text" ? "#fff" : "var(--text-muted)", fontWeight: 600,
              }}
            >
              Text
            </button>
          </div>
        </div>

        {overlay.type === "image" ? (
          <>
            {/* Upload Zone & Drag Source */}
            <div
              draggable={Boolean(kit.logo)}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-brand-logo", "true");
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => logoRef.current?.click()}
              style={{
                height: 84, border: "1.5px dashed var(--border)", borderRadius: "var(--r-md)",
                background: "var(--bg-inset)", display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", gap: 8, position: "relative",
                overflow: "hidden", transition: "border-color 0.12s",
                opacity: uploadingLogo ? 0.6 : 1,
              }}
              title={kit.logo ? "Click to change, or drag onto canvas" : "Click or drop logo to upload"}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-dim)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              {kit.logo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={kit.logo} alt="Brand Logo"
                    style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", padding: 8 }} />
                  <div style={{
                    position: "absolute", bottom: 4, right: 6, fontSize: 9,
                    color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.6)", padding: "1px 5px", borderRadius: 3
                  }}>
                    Drag to canvas ↗
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {uploadingLogo ? "Uploading..." : "Click or drop logo image"}
                  </span>
                </div>
              )}
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: "none" }}
                onChange={e => handleLogoUpload(e.target.files)} />
            </div>

            {/* Monochrome Tint Toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Monochrome Tint</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => updateOverlay({ tintColor: overlay.tintColor ? null : kit.primaryColor })}
                  style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--border)",
                    background: overlay.tintColor ? "var(--accent-bg)" : "var(--bg-inset)",
                    color: overlay.tintColor ? "var(--accent)" : "var(--text-muted)", cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {overlay.tintColor ? "Enabled" : "Off"}
                </button>
                {overlay.tintColor && (
                  <input
                    type="color"
                    value={overlay.tintColor}
                    onChange={e => updateOverlay({ tintColor: e.target.value })}
                    style={{ width: 20, height: 20, padding: 0, border: "none", cursor: "pointer", borderRadius: 3 }}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Text Watermark Copy</span>
            <input
              value={overlay.text ?? kit.name}
              onChange={(e) => updateOverlay({ text: e.target.value })}
              placeholder="e.g. BRAND NAME"
              style={{
                width: "100%", background: "var(--bg-inset)", border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)", padding: "6px 8px", fontSize: 12,
                color: "var(--text-primary)", outline: "none",
              }}
            />
          </div>
        )}

        {/* Canvas Placement Button */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => {
              const nextEnabled = !overlay.enabled;
              updateOverlay({ enabled: nextEnabled });
              if (nextEnabled) {
                setInspectorTarget({ type: "logo" });
              }
            }}
            style={{
              flex: 1, padding: "7px 0", borderRadius: "var(--r-sm)",
              background: overlay.enabled ? "var(--accent-bg)" : "var(--bg-inset)",
              border: `1px solid ${overlay.enabled ? "var(--accent-dim)" : "var(--border)"}`,
              color: overlay.enabled ? "var(--accent)" : "var(--text-secondary)",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >
            {overlay.enabled ? "✓ Logo Placed on Video" : "+ Place Logo on Video"}
          </button>
          {overlay.enabled && (
            <button
              onClick={() => setInspectorTarget({ type: "logo" })}
              style={{
                padding: "7px 10px", borderRadius: "var(--r-sm)",
                background: "var(--bg-inset)", border: "1px solid var(--border)",
                color: "var(--text-muted)", fontSize: 11, cursor: "pointer",
              }}
              title="Select & Edit on Canvas"
            >
              Select
            </button>
          )}
        </div>

        {/* Quick Position Presets */}
        {overlay.enabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Quick Position Preset</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
              {[
                { label: "TL", x: 6, y: 6 },
                { label: "TR", x: 76, y: 6 },
                { label: "Center", x: 40, y: 45 },
                { label: "BL", x: 6, y: 84 },
                { label: "BR", x: 76, y: 84 },
              ].map((pos) => (
                <button
                  key={pos.label}
                  onClick={() => updateOverlay({ x: pos.x, y: pos.y })}
                  style={{
                    padding: "4px 2px", fontSize: 10, borderRadius: 3, border: "1px solid var(--border)",
                    background: "var(--bg-inset)", color: "var(--text-secondary)", cursor: "pointer",
                    fontWeight: 600, textAlign: "center",
                  }}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            {/* Size & Opacity Sliders */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>Width: {overlay.width}%</div>
                <input
                  type="range" min={8} max={50} value={overlay.width}
                  onChange={(e) => updateOverlay({ width: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>Opacity: {Math.round(overlay.opacity * 100)}%</div>
                <input
                  type="range" min={10} max={100} value={Math.round(overlay.opacity * 100)}
                  onChange={(e) => updateOverlay({ opacity: Number(e.target.value) / 100 })}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Colors */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Brand Colors
        </div>
        <ColorInput label="Primary (Captions & Accents)" value={kit.primaryColor} onChange={v => update({ primaryColor: v })} />
        <ColorInput label="Secondary (Backgrounds & Boxes)" value={kit.secondaryColor} onChange={v => update({ secondaryColor: v })} />
        <ColorInput label="Accent (Highlights)" value={kit.accentColor} onChange={v => update({ accentColor: v })} />
      </div>

      {/* Typography */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Typography
        </div>
        {([["Heading Font", "fontHeading"], ["Body Font", "fontBody"]] as [string, "fontHeading" | "fontBody"][]).map(([label, key]) => (
          <div key={key}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
            <select
              value={kit[key] as string}
              onChange={e => update({ [key]: e.target.value })}
              style={{
                width: "100%", background: "var(--bg-inset)", border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)", padding: "6px 8px",
                fontSize: 12, color: "var(--text-primary)", cursor: "pointer", outline: "none",
              }}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Apply to all captions */}
      <button
        onClick={applyColorsToAllCaptions}
        style={{
          width: "100%", padding: "8px 0",
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: "var(--r-md)", color: "var(--text-secondary)",
          fontSize: 11, fontWeight: 600, cursor: "pointer",
          transition: "all 0.12s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-dim)"; e.currentTarget.style.background = "var(--accent-bg)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
      >
        Sync Brand Colors & Font to Captions
      </button>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: "100%", padding: "10px 0", borderRadius: "var(--r-md)",
          background: saved ? "var(--success-bg)" : "var(--accent)",
          color: saved ? "var(--success)" : "#FFFFFF",
          border: `1px solid ${saved ? "var(--success)" : "transparent"}`,
          fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          opacity: saving ? 0.7 : 1, transition: "all 0.2s",
        }}>
        {saving ? "Saving…" : saved ? "✓ Brand Kit Saved!" : "Save Brand Kit"}
      </button>
    </div>
  );
}
