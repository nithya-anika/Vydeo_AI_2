'use client'

import { Sparkles } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'

export function AIAnalysisPanel() {
  const { aiPrompt, aiScore, aiFeedback } = useEditorStore()

  if (aiScore === null && aiPrompt === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        No analysis available. Go back to the Footage tab and type a prompt to generate an AI edit!
      </div>
    )
  }

  return (
    <div style={{ padding: 16, height: '100%', overflowY: 'auto', background: 'var(--bg-panel)' }}>
      <div style={{ marginBottom: 20, padding: 16, background: "rgba(255, 255, 255, 0.03)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Sparkles size={16} color="var(--accent)" />
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Initial Edit Analysis</span>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {aiScore !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: aiScore > 90 ? "rgba(16,185,129,0.15)" : aiScore > 75 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                border: `1px solid ${aiScore > 90 ? "rgba(16,185,129,0.4)" : aiScore > 75 ? "rgba(245,158,11,0.4)" : "rgba(239,68,68,0.4)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: aiScore > 90 ? "#10B981" : aiScore > 75 ? "#F59E0B" : "#EF4444",
                fontSize: 14, fontWeight: 800,
              }}>
                {aiScore}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  {aiScore > 95 ? "Perfect Match" : aiScore > 80 ? "Good Match" : "Needs Review"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Prompt Adherence</div>
              </div>
            </div>
          )}
          {aiPrompt && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>Prompt</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", background: "var(--bg-inset)", padding: 10, borderRadius: "var(--r-sm)" }}>
                "{aiPrompt}"
              </div>
            </div>
          )}
          {aiFeedback && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>QA Checklist</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--bg-inset)", border: "1px solid var(--border)", padding: 12, borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {aiFeedback}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}