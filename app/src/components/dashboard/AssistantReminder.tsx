"use client";

import { useState } from "react";
import { useAssistantStore } from "@/store/assistantStore";
import { Sparkles, Save, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function AssistantReminder() {
  const { name, customized, isLoading, setName } = useAssistantStore();
  const [dismissed, setDismissed] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading || customized || dismissed) return null;

  const handleSave = async () => {
    if (!draftName.trim() || draftName.length > 24) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/assistant-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantName: draftName.trim(), assistantNameCustomized: true }),
      });
      const data = await res.json();
      if (data.success) {
        setName(data.assistantName, data.assistantNameCustomized);
      }
    } catch {
      // Ignore
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-2xl)', padding: '32px', width: '100%', maxWidth: 480,
            boxShadow: '0 32px 80px rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column', gap: 20,
            position: 'relative'
          }}
        >
          <button onClick={() => setDismissed(true)} style={{ position: 'absolute', top: 24, right: 24, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Name Your AI Companion</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Who will be your creative sidekick?</p>
            </div>
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Choose a Name</label>
              <input 
                type="text" 
                value={draftName} 
                onChange={e => setDraftName(e.target.value)} 
                placeholder="e.g. Jarvis, Alex, Nova" 
                maxLength={24}
                style={{ 
                  width: '100%', padding: '12px 16px', background: 'var(--bg-panel)', border: '1px solid var(--border)', 
                  borderRadius: 'var(--r-lg)', color: 'var(--text-primary)', fontSize: 16, marginTop: 8, outline: 'none' 
                }} 
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {["Jarvis", "Alex", "Nova", "Rumi"].map(sug => (
                <button 
                  key={sug} 
                  onClick={() => setDraftName(sug)}
                  style={{ padding: '6px 12px', borderRadius: 'var(--r-full)', background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button 
              onClick={() => setDismissed(true)}
              style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Maybe Later
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving || !draftName.trim()}
              style={{ flex: 2, padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--r-lg)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: (!draftName.trim() || isSaving) ? 'not-allowed' : 'pointer', opacity: (!draftName.trim() || isSaving) ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Companion Name
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
