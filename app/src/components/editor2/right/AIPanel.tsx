'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, ArrowUp } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { IconButton } from '@/components/ui'
import { processAICommand, QUICK_CHIPS } from '../lib/aiCommands'

interface ChatMessage { id: string; role: 'user' | 'assistant' | 'system'; text: string; isError?: boolean }

export function AIPanel() {
  const { aiPrompt, aiScore, aiFeedback } = useEditorStore();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '0', role: 'system', text: "Hi — I'm your AI creative director. Ask me to refine pacing, add captions, change the look, or anything else." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const setIsGenerating = useEditorStore((s) => s.setIsGenerating)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', text: text.trim() }])
    setInput('')
    setLoading(true)
    setIsGenerating(true)
    try {
      const reply = await processAICommand(text.trim(), useEditorStore.getState())
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', text: reply }])
    } catch (e) {
      setMessages((m) => [...m, {
        id: crypto.randomUUID(), role: 'assistant', isError: true,
        text: e instanceof Error ? e.message : 'Something went wrong — try rephrasing, or adjust it manually in the tools on the left.',
      }])
    } finally {
      setLoading(false)
      setIsGenerating(false)
    }
  }, [loading, setIsGenerating])

  return (
    <div className="ai-panel">
      <div className="ai-log" aria-live="polite">
        
        {/* AI Evaluation Scorecard from Footage Page */}
        {(aiScore !== null || aiPrompt !== null) && (
          <div style={{ marginBottom: 20, padding: 12, background: "rgba(255, 255, 255, 0.03)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Sparkles size={14} color="var(--accent)" />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Initial Edit Analysis</span>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {aiScore !== null && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: aiScore > 90 ? "rgba(16,185,129,0.15)" : aiScore > 75 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                    border: `1px solid ${aiScore > 90 ? "rgba(16,185,129,0.4)" : aiScore > 75 ? "rgba(245,158,11,0.4)" : "rgba(239,68,68,0.4)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: aiScore > 90 ? "#10B981" : aiScore > 75 ? "#F59E0B" : "#EF4444",
                    fontSize: 12, fontWeight: 800,
                  }}>
                    {aiScore}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
                      {aiScore > 95 ? "Perfect Match" : aiScore > 80 ? "Good Match" : "Needs Review"}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Prompt Adherence</div>
                  </div>
                </div>
              )}
              {aiPrompt && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 3 }}>Prompt</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic", background: "var(--bg-inset)", padding: 6, borderRadius: "var(--r-sm)" }}>
                    "{aiPrompt}"
                  </div>
                </div>
              )}
              {aiFeedback && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 3 }}>QA Agent Checklist</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-inset)", border: "1px solid var(--border)", padding: 8, borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {aiFeedback}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`ai-msg${m.role === 'user' ? ' is-user' : ''}`}>
            {m.role !== 'user' && <span className="ai-avatar" aria-hidden="true"><Sparkles size={11} /></span>}
            <div className={`ai-bubble ${m.role === 'user' ? 'is-user' : m.isError ? 'is-error' : 'is-assistant'}`}>{m.text}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg">
            <span className="ai-avatar" aria-hidden="true"><Sparkles size={11} /></span>
            <div className="ai-bubble is-assistant"><span className="ai-thinking"><span /><span /><span /></span></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="ai-suggest">
        {QUICK_CHIPS.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => send(c)}>{c}</button>
        ))}
      </div>

      <div className="ai-input-row">
        <textarea
          className="textarea-base"
          rows={1}
          value={input}
          placeholder="Ask your AI director…"
          disabled={loading}
          aria-label="Message the AI creative director"
          style={{ minHeight: 38 }}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
        />
        <IconButton label="Send" variant="primary" size="md" disabled={!input.trim() || loading} onClick={() => send(input)}>
          <ArrowUp size={15} />
        </IconButton>
      </div>
    </div>
  )
}
