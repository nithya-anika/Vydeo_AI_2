"use client";
import { useState, useEffect } from "react";
import { useAssistantStore } from "@/store/assistantStore";
import { Sparkles, Save, RotateCcw, Loader2 } from "lucide-react";

export function CompanionSettings() {
  const { name, customized, setName } = useAssistantStore();
  const [draftName, setDraftName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    setDraftName(name);
  }, [name]);

  const handleSave = async (newName: string, isCustomized: boolean) => {
    if (!newName.trim() || newName.length > 24) return;
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/user/assistant-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantName: newName.trim(), assistantNameCustomized: isCustomized }),
      });
      const data = await res.json();
      if (data.success) {
        setName(data.assistantName, data.assistantNameCustomized);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 2500);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', overflow: 'hidden', marginBottom: 24, scrollMarginTop: 80 }} id="companion">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)' }}>
          <Sparkles size={18} strokeWidth={1.8} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Your AI Companion ✨</h2>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Give your creative sidekick a name of its own.
        </div>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700 }}>
              {draftName.charAt(0).toUpperCase() || "R"}
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                placeholder="Choose a name, e.g. Nova"
                maxLength={24}
                style={{
                  width: '100%', maxWidth: 280, padding: '8px 12px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)', color: 'var(--text-primary)', fontSize: 14,
                  outline: 'none'
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              disabled={isSaving || draftName.trim() === "" || draftName.length > 24}
              onClick={() => handleSave(draftName, true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 'var(--r-md)', fontSize: 12, fontWeight: 600, cursor: (isSaving || draftName.trim() === "") ? 'not-allowed' : 'pointer', opacity: (isSaving || draftName.trim() === "") ? 0.6 : 1 }}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save my companion
            </button>
            {draftName !== name && !isSaving && (
              <button style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '7px 12px', borderRadius: 'var(--r-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={() => setDraftName(name)}>
                Cancel
              </button>
            )}
            {draftName !== "Rumi" && (
              <button
                onClick={() => { setDraftName("Rumi"); handleSave("Rumi", true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '7px 12px', borderRadius: 'var(--r-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                <RotateCcw size={14} />
                Reset to Rumi
              </button>
            )}
            {saveStatus === "success" && <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>Saved!</span>}
            {saveStatus === "error" && <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>Failed to save</span>}
          </div>
          <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Live Preview: </span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>"Ask {draftName || "..."} ✨"</span>
          </div>
        </div>
      </div>
    </div>
  );
}
