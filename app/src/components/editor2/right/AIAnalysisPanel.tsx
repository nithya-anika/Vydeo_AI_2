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
          const lowerLine = line.toLowerCase();
          
          // 1. Detect Score Line (supports "score : 60%", "score: 60%", "🎯 PROMPT COMPLIANCE SCORE: ...", etc.)
          if (lowerLine.includes('score :') || lowerLine.includes('score:') || line.startsWith('🎯')) {
            const scoreMatch = line.match(/(\d+)\s*%/);
            const scoreVal = scoreMatch ? Number(scoreMatch[1]) : (aiScore ?? 0);
            const scoreText = `${scoreVal}%`;
            const detailText = line
              .replace(/🎯\s*/g, '')
              .replace(/score\s*:\s*\d+\s*%/gi, '')
              .replace(/PROMPT COMPLIANCE SCORE:\s*\d+%\s*/i, '')
              .trim();
            
            return (
              <div key={index} style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                borderRadius: 'var(--r-lg)',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginBottom: 8,
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
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontWeight: 500 }}>
                    {detailText || "Points Passed / Total Points"}
                  </div>
                </div>
              </div>
            );
          }
          
          // 2. Detect Section Headers
          if (lowerLine === 'passed:' || lowerLine === 'passed') {
            return (
              <div key={index} style={{ fontSize: 11, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', marginTop: 12, marginBottom: 4, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }}></span>
                PASSED
              </div>
            );
          }
          if (lowerLine === 'failed:' || lowerLine === 'failed') {
            return (
              <div key={index} style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', marginTop: 12, marginBottom: 4, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }}></span>
                FAILED
              </div>
            );
          }

          // 3. Detect Passed Item (contains ✅, ✓, or [PASSED])
          const isPassedItem = 
            line.includes('✅') || 
            line.includes('✓') || 
            lowerLine.includes('[passed]');
            
          // 4. Detect Failed Item (contains ❌, ✗, or [FAILED])
          const isFailedItem = 
            line.includes('❌') || 
            line.includes('✗') || 
            lowerLine.includes('[failed]');

          if (isPassedItem || isFailedItem) {
            const isPassed = isPassedItem && !isFailedItem; // fallback check
            
            // Clean emojis, numbering, and brackets
            let cleanedText = line
              .replace(/^[✅❌✓✗\s]*/g, '') // remove leading symbols
              .replace(/[✅❌✓✗\s]*$/g, '') // remove trailing symbols
              .replace(/^\[PASSED\]\s*/gi, '')
              .replace(/^\[FAILED\]\s*/gi, '')
              .replace(/^Point:\s*/gi, '')
              .trim();

            // Try to extract dynamic number if line starts with e.g. "1) " or "1. " or "   1. "
            const numMatch = line.match(/^\s*(\d+)[\.\)]\s*/);
            const numText = numMatch ? numMatch[1] : (isPassed ? "✓" : "✗");
            
            if (numMatch) {
              // Strip the leading number from the text as we render it in the badge
              cleanedText = cleanedText.replace(/^\d+[\.\)]\s*/, '');
            }

            return (
              <div key={index} style={{
                background: isPassed ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                border: `1px solid ${isPassed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'}`,
                borderRadius: 'var(--r-md)',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                marginBottom: 2,
              }}>
                <div style={{
                  width: 18, height: 16, borderRadius: '4px',
                  background: isPassed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: isPassed ? '#10b981' : '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, flexShrink: 0, marginTop: 1
                }}>{numText}</div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {cleanedText}
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