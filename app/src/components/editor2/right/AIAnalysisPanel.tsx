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

  const renderFeedbackLines = () => {
    if (!aiFeedback) return null;
    const lines = aiFeedback.split('\n').map(l => l.trim()).filter(Boolean);
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lines.map((line, index) => {
          if (line.startsWith('🎯')) {
            const scoreMatch = line.match(/(\d+)%/);
            const scoreVal = scoreMatch ? Number(scoreMatch[1]) : (aiScore ?? 0);
            const scoreText = `${scoreVal}%`;
            const detailText = line.replace(/🎯\s*/, '').replace(/PROMPT COMPLIANCE SCORE:\s*\d+%\s*/i, '');
            
            return (
              <div key={index} style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                borderRadius: 'var(--r-lg)',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginBottom: 10,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              }}>
                <div style={{
                  fontSize: 32,
                  fontWeight: 900,
                  background: 'linear-gradient(to right, #a855f7, #6366f1)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontFamily: 'monospace',
                  letterSpacing: '-0.02em',
                }}>
                  {scoreText}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>PROMPT COMPLIANCE</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontWeight: 500 }}>{detailText}</div>
                </div>
              </div>
            );
          }
          
          if (line.startsWith('✅')) {
            const text = line.replace(/^✅\s*\[PASSED\]\s*Point:\s*/, '').replace(/^✅\s*Point:\s*/, '').replace(/^✅\s*/, '');
            return (
              <div key={index} style={{
                background: 'rgba(16, 185, 129, 0.04)',
                border: '1px solid rgba(16, 185, 129, 0.12)',
                borderRadius: 'var(--r-md)',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 900, flexShrink: 0, marginTop: 1
                }}>✓</div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  <strong style={{ color: '#10b981', fontWeight: 700 }}>Passed:</strong> {text}
                </span>
              </div>
            );
          }
          
          if (line.startsWith('❌')) {
            const text = line.replace(/^❌\s*\[FAILED\]\s*Point:\s*/, '').replace(/^❌\s*Point:\s*/, '').replace(/^❌\s*/, '');
            return (
              <div key={index} style={{
                background: 'rgba(239, 68, 68, 0.04)',
                border: '1px solid rgba(239, 68, 68, 0.12)',
                borderRadius: 'var(--r-md)',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 900, flexShrink: 0, marginTop: 1
                }}>✗</div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  <strong style={{ color: '#ef4444', fontWeight: 700 }}>Failed:</strong> {text}
                </span>
              </div>
            );
          }
          
          // Regular line
          return (
            <div key={index} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: 4 }}>
              {line}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ padding: 16, height: '100%', overflowY: 'auto', background: 'var(--bg-panel)' }}>
      <div style={{ marginBottom: 20, padding: 16, background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Sparkles size={16} color="var(--accent)" />
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Initial Edit Analysis</span>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {aiPrompt && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6, letterSpacing: '0.04em' }}>Prompt</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", background: "var(--bg-inset)", padding: 10, borderRadius: "var(--r-sm)", border: '1px solid var(--border)' }}>
                "{aiPrompt}"
              </div>
            </div>
          )}
          
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8, letterSpacing: '0.04em' }}>QA Checklist</div>
            {renderFeedbackLines()}
          </div>
        </div>
      </div>
    </div>
  )
}