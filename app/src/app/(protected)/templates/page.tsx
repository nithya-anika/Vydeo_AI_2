'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Star, Zap, Clock, Film, Users, ArrowRight,
  Sparkles, Flame, ChevronRight, ChevronLeft, Play,
  Music2, Tag, LayoutGrid, Tv2, Smartphone, Briefcase, AtSign,
  Upload, Scissors, X, Trash2, RotateCcw, Image as ImageIcon, Video as VideoIcon,
  CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { Variants } from 'framer-motion'
import { TEMPLATES as TEMPLATE_REGISTRY } from '@/lib/templates/registry'
import type { ReferenceMedia, ReferenceStyleProfile, TemplateCustomizationPayload } from '@/types/references'

// ─── Template Data ────────────────────────────────────────────────────────────

// Map backend registry to frontend UI model
const TEMPLATES = Object.values(TEMPLATE_REGISTRY).map(t => ({
  id: Number(Object.keys(TEMPLATE_REGISTRY).find(k => TEMPLATE_REGISTRY[Number(k)].id === t.id)),
  _stringId: t.id,
  name: t.name,
  category: t.category,
  platform: t.platform,
  duration: `${t.targetDurationMin}-${t.targetDurationMax}s`,
  scenes: t.sceneCountRange[1],
  captionStyle: t.captionStyle,
  musicStyle: t.musicStyle,
  previewVideoUrl: t.previewVideoUrl,
  targetAudience: "Broad",
  difficulty: 'Beginner' as const,
  editTime: '~5 min',
  rating: Number((4.5 + (Math.random() * 0.4)).toFixed(1)),
  uses: Math.floor(1000 + Math.random() * 4000),
  isAIPick: [1, 3, 5].includes(Number(Object.keys(TEMPLATE_REGISTRY).find(k => TEMPLATE_REGISTRY[Number(k)].id === t.id))),
  gradient: [
    'linear-gradient(135deg, #0d0d1a 0%, #1a1035 50%, #2d1b69 100%)',
    'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
    'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    'linear-gradient(135deg, #0a0010 0%, #20003a 100%)',
    'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
  ][Number(Object.keys(TEMPLATE_REGISTRY).find(k => TEMPLATE_REGISTRY[Number(k)].id === t.id)) % 5] || 'linear-gradient(135deg, #0d0d1a 0%, #1a1035 50%, #2d1b69 100%)',
}))

type Template = typeof TEMPLATES[0]

const CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'ads', label: 'Ads' },
  { id: 'ugc', label: 'UGC' },
  { id: 'travel', label: 'Travel' },
  { id: 'brand', label: 'Brand' },
  { id: 'local', label: 'Local' },
]

const PLATFORM_FILTERS = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn']

const SECTION_TABS = [
  { id: 'most-used', label: 'Most Used', icon: Flame },
  { id: 'new', label: 'New', icon: Sparkles },
  { id: 'ai-picks', label: 'AI Picks', icon: Zap },
]

const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner: 'var(--success)',
  Intermediate: 'var(--info)',
  Advanced: 'var(--warning)',
}

const DIFFICULTY_BG: Record<string, string> = {
  Beginner: 'rgba(16,185,129,0.1)',
  Intermediate: 'rgba(59,130,246,0.1)',
  Advanced: 'rgba(245,158,11,0.1)',
}

// ─── Template Thumbnail SVGs ──────────────────────────────────────────────────

function TemplateThumbnail({ template }: { template: Template }) {
  const id = `tmpl-${template.id}`

  // ── Luxury Product Showcase (ads / Instagram) – dark purple ──
  if (template.id === 1) {
    return (
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <style>{`
            @keyframes ${id}-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
            @keyframes ${id}-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
            @keyframes ${id}-shimmer { 0%{opacity:.15} 50%{opacity:.45} 100%{opacity:.15} }
            .${id}-p{animation:${id}-pulse 3s ease-in-out infinite}
            .${id}-f{animation:${id}-float 4s ease-in-out infinite}
            .${id}-s{animation:${id}-shimmer 2.5s ease-in-out infinite}
          `}</style>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0d0d1a"/>
            <stop offset="50%" stopColor="#1a1035"/>
            <stop offset="100%" stopColor="#2d1b69"/>
          </linearGradient>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c9a96e"/>
            <stop offset="100%" stopColor="#f0d080"/>
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="200" height="112" fill={`url(#${id}-bg)`}/>
        <ellipse cx="100" cy="56" rx="80" ry="50" fill={`url(#${id}-glow)`} className={`${id}-p`}/>
        {[30,50,70,90,110,130,150,170].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2="112" stroke="rgba(167,139,250,0.06)" strokeWidth="1"/>
        ))}
        {[28,56,84].map(y => (
          <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="rgba(167,139,250,0.06)" strokeWidth="1"/>
        ))}
        <g className={`${id}-f`} style={{transformOrigin:'100px 56px'}}>
          <rect x="72" y="20" width="56" height="72" rx="4" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="1.2"/>
          <rect x="78" y="26" width="44" height="60" rx="3" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"/>
          <rect x="85" y="34" width="30" height="3" rx="1.5" fill={`url(#${id}-gold)`} opacity="0.8"/>
          <rect x="88" y="41" width="24" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
          <rect x="83" y="52" width="34" height="18" rx="2" fill="rgba(124,58,237,0.3)" stroke="rgba(167,139,250,0.2)" strokeWidth="0.5"/>
          <rect x="88" y="57" width="24" height="2" rx="1" fill="rgba(255,255,255,0.15)"/>
          <rect x="90" y="62" width="20" height="2" rx="1" fill="rgba(255,255,255,0.1)"/>
          <rect x="83" y="75" width="34" height="6" rx="1.5" fill={`url(#${id}-gold)`} opacity="0.6"/>
        </g>
        <circle cx="20" cy="20" r="12" fill="none" stroke="rgba(167,139,250,0.15)" strokeWidth="1" className={`${id}-s`}/>
        <circle cx="20" cy="20" r="6" fill="none" stroke="rgba(167,139,250,0.2)" strokeWidth="0.5"/>
        <circle cx="180" cy="92" r="12" fill="none" stroke="rgba(201,169,110,0.15)" strokeWidth="1" className={`${id}-s`} style={{animationDelay:'1.2s'}}/>
        {[0,1,2].map(row => [0,1,2].map(col => (
          <circle key={`${row}-${col}`} cx={160+col*8} cy={30+row*8} r="1" fill="rgba(167,139,250,0.3)" className={`${id}-p`} style={{animationDelay:`${(row+col)*0.3}s`}}/>
        )))}
        <rect x="10" y="95" width="80" height="4" rx="2" fill="rgba(201,169,110,0.5)" className={`${id}-s`}/>
        <rect x="10" y="102" width="55" height="3" rx="1.5" fill="rgba(255,255,255,0.12)"/>
        <circle cx="186" cy="14" r="6" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5"/>
        <rect x="183" y="11" width="6" height="6" rx="1.5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8"/>
      </svg>
    )
  }

  // ── Viral TikTok Hook (ugc / TikTok) – dark ──
  if (template.id === 2) {
    return (
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <style>{`
            @keyframes ${id}-beat { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.6)} }
            @keyframes ${id}-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            @keyframes ${id}-blink { 0%,90%,100%{opacity:1} 95%{opacity:0} }
            .${id}-bar{animation:${id}-beat .6s ease-in-out infinite}
            .${id}-spin{animation:${id}-spin 8s linear infinite}
            .${id}-blink{animation:${id}-blink 2s ease-in-out infinite}
          `}</style>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a0a0a"/>
            <stop offset="100%" stopColor="#1a1a2e"/>
          </linearGradient>
          <linearGradient id={`${id}-tk`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff0050"/>
            <stop offset="100%" stopColor="#00f2ea"/>
          </linearGradient>
        </defs>
        <rect width="200" height="112" fill={`url(#${id}-bg)`}/>
        <rect x="70" y="8" width="60" height="96" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
        <rect x="74" y="14" width="52" height="80" rx="5" fill="rgba(0,0,0,0.5)"/>
        <g style={{transformOrigin:'100px 54px'}} className={`${id}-spin`}>
          <circle cx="100" cy="54" r="18" fill="none" stroke="rgba(255,0,80,0.2)" strokeWidth="1"/>
          <circle cx="100" cy="54" r="12" fill="none" stroke="rgba(0,242,234,0.2)" strokeWidth="1"/>
        </g>
        <path d="M96 44 L96 62 C93.5 62 91 60 91 57 C91 54 93.5 52 96 52 L96 48 C91 48 87 52 87 57 C87 62 91 66 96 66 C101 66 105 62 105 57 L105 44 L109 44 C109 47 111 49 113 49 L113 45 C111 45 109 43 109 41 L105 41 L105 44 Z" fill="none" stroke={`url(#${id}-tk)`} strokeWidth="1.5" strokeLinejoin="round"/>
        {[0,1,2,3,4,5,6,7].map((i) => {
          const heights = [8,14,10,18,12,16,9,13]
          return (
            <rect
              key={i}
              x={78 + i * 6}
              y={96 - heights[i]}
              width="4"
              height={heights[i]}
              rx="2"
              fill={`url(#${id}-tk)`}
              opacity="0.7"
              className={`${id}-bar`}
              style={{ transformOrigin: `${80 + i * 6}px 96px`, animationDelay: `${i * 0.08}s` }}
            />
          )
        })}
        <rect x="77" y="22" width="46" height="4" rx="2" fill="rgba(255,0,80,0.7)"/>
        <rect x="81" y="29" width="38" height="3" rx="1.5" fill="rgba(255,255,255,0.2)"/>
        <circle cx="117" cy="16" r="3" fill="#ff0050" className={`${id}-blink`}/>
        {[0,1,2].map(i => (
          <circle key={i} cx="22" cy={36+i*16} r="2" fill="rgba(0,242,234,0.4)" className={`${id}-spin`} style={{animationDelay:`${i*0.4}s`, transformOrigin:'22px 56px'}}/>
        ))}
        {[0,1,2].map(i => (
          <circle key={i} cx="178" cy={36+i*16} r="2" fill="rgba(255,0,80,0.4)" className={`${id}-spin`} style={{animationDelay:`${i*0.4+0.2}s`, transformOrigin:'178px 56px'}}/>
        ))}
      </svg>
    )
  }

  // ── Cinematic Travel Reel (travel / YouTube) – deep blue ──
  if (template.id === 3) {
    return (
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <style>{`
            @keyframes ${id}-cloud { 0%{transform:translateX(0)} 100%{transform:translateX(30px)} }
            @keyframes ${id}-star { 0%,100%{opacity:.2} 50%{opacity:1} }
            @keyframes ${id}-scan { 0%{transform:translateY(0)} 100%{transform:translateY(80px)} }
            .${id}-cloud{animation:${id}-cloud 12s ease-in-out infinite alternate}
            .${id}-star{animation:${id}-star 3s ease-in-out infinite}
            .${id}-scan{animation:${id}-scan 4s linear infinite;opacity:.3}
          `}</style>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f2027"/>
            <stop offset="50%" stopColor="#203a43"/>
            <stop offset="100%" stopColor="#2c5364"/>
          </linearGradient>
          <linearGradient id={`${id}-mtn`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a3a4a"/>
            <stop offset="100%" stopColor="#0d2030"/>
          </linearGradient>
        </defs>
        <rect width="200" height="112" fill={`url(#${id}-bg)`}/>
        {[[15,12],[35,8],[60,15],[80,5],[120,10],[145,8],[170,14],[190,6]].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r="1" fill="#fff" className={`${id}-star`} style={{animationDelay:`${i*0.4}s`}}/>
        ))}
        <polygon points="0,80 30,35 60,80" fill="#12303d" opacity="0.8"/>
        <polygon points="40,80 80,28 120,80" fill="#163545" opacity="0.9"/>
        <polygon points="90,80 130,38 170,80" fill="#193a4a"/>
        <polygon points="150,80 185,42 200,80" fill="#122d3a" opacity="0.8"/>
        <polygon points="80,28 72,46 88,46" fill="rgba(255,255,255,0.12)"/>
        <polygon points="130,38 123,52 137,52" fill="rgba(255,255,255,0.1)"/>
        <rect x="0" y="78" width="200" height="34" fill="#0a1e28"/>
        <ellipse cx="100" cy="78" rx="100" ry="10" fill="rgba(44,83,100,0.5)"/>
        <g className={`${id}-cloud`}>
          <ellipse cx="40" cy="30" rx="18" ry="6" fill="rgba(255,255,255,0.04)"/>
          <ellipse cx="52" cy="27" rx="12" ry="5" fill="rgba(255,255,255,0.04)"/>
        </g>
        <g className={`${id}-cloud`} style={{animationDelay:'3s', animationDuration:'15s'}}>
          <ellipse cx="140" cy="22" rx="22" ry="7" fill="rgba(255,255,255,0.03)"/>
          <ellipse cx="155" cy="19" rx="14" ry="5" fill="rgba(255,255,255,0.03)"/>
        </g>
        <rect x="0" y="20" width="200" height="1" fill="rgba(44,83,100,0.6)" className={`${id}-scan`}/>
        <rect x="0" y="0" width="200" height="12" fill="rgba(0,0,0,0.5)"/>
        <rect x="0" y="100" width="200" height="12" fill="rgba(0,0,0,0.5)"/>
        <rect x="88" y="82" width="24" height="16" rx="4" fill="rgba(255,0,0,0.7)"/>
        <polygon points="96,86 96,94 104,90" fill="#fff"/>
      </svg>
    )
  }

  // ── Product Launch Hype (ads / Instagram) – dark purple ──
  if (template.id === 4) {
    return (
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <style>{`
            @keyframes ${id}-ring { 0%{r:12;opacity:.8} 100%{r:35;opacity:0} }
            @keyframes ${id}-zap { 0%,100%{opacity:1} 45%,55%{opacity:0} }
            .${id}-ring{animation:${id}-ring 2s ease-out infinite}
            .${id}-zap{animation:${id}-zap 1.8s ease-in-out infinite}
          `}</style>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a0010"/>
            <stop offset="100%" stopColor="#20003a"/>
          </linearGradient>
          <linearGradient id={`${id}-elec`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a855f7"/>
            <stop offset="100%" stopColor="#7c3aed"/>
          </linearGradient>
          <radialGradient id={`${id}-burst`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.6"/>
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="200" height="112" fill={`url(#${id}-bg)`}/>
        <circle cx="100" cy="52" r="50" fill={`url(#${id}-burst)`}/>
        <circle cx="100" cy="52" r="20" fill="none" stroke="rgba(124,58,237,0.6)" strokeWidth="1" className={`${id}-ring`}/>
        <circle cx="100" cy="52" r="20" fill="none" stroke="rgba(168,85,247,0.4)" strokeWidth="0.8" className={`${id}-ring`} style={{animationDelay:'0.6s'}}/>
        <circle cx="100" cy="52" r="20" fill="none" stroke="rgba(168,85,247,0.3)" strokeWidth="0.6" className={`${id}-ring`} style={{animationDelay:'1.2s'}}/>
        <rect x="82" y="22" width="36" height="60" rx="6" fill="rgba(255,255,255,0.06)" stroke={`url(#${id}-elec)`} strokeWidth="1.5"/>
        <rect x="86" y="28" width="28" height="44" rx="3" fill="rgba(0,0,0,0.6)"/>
        <rect x="89" y="32" width="22" height="3" rx="1.5" fill="rgba(168,85,247,0.8)"/>
        <rect x="91" y="38" width="18" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
        <rect x="89" y="43" width="22" height="12" rx="2" fill="rgba(124,58,237,0.4)"/>
        <rect x="92" y="58" width="16" height="2" rx="1" fill="rgba(255,255,255,0.2)"/>
        <rect x="89" y="63" width="22" height="5" rx="2" fill="rgba(168,85,247,0.6)"/>
        <path d="M55 35 L48 52 L56 52 L49 69" stroke="rgba(168,85,247,0.5)" strokeWidth="1.5" strokeLinejoin="round" fill="none" className={`${id}-zap`}/>
        <path d="M145 28 L140 44 L146 44 L141 60" stroke="rgba(168,85,247,0.4)" strokeWidth="1.2" strokeLinejoin="round" fill="none" className={`${id}-zap`} style={{animationDelay:'0.9s'}}/>
        <rect x="10" y="44" width="30" height="3" rx="1.5" fill="rgba(168,85,247,0.5)"/>
        <rect x="10" y="50" width="22" height="2" rx="1" fill="rgba(255,255,255,0.15)"/>
        <rect x="10" y="55" width="26" height="2" rx="1" fill="rgba(255,255,255,0.1)"/>
        <rect x="160" y="44" width="30" height="3" rx="1.5" fill="rgba(168,85,247,0.5)"/>
        <rect x="163" y="50" width="22" height="2" rx="1" fill="rgba(255,255,255,0.15)"/>
        <rect x="161" y="55" width="26" height="2" rx="1" fill="rgba(255,255,255,0.1)"/>
        <rect x="20" y="90" width="160" height="6" rx="3" fill="rgba(168,85,247,0.35)"/>
        <rect x="20" y="90" width="110" height="6" rx="3" fill="rgba(124,58,237,0.7)"/>
        <rect x="182" y="8" width="10" height="10" rx="3" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
        <circle cx="187" cy="13" r="2.5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7"/>
        <circle cx="189.5" cy="10.5" r="0.7" fill="rgba(255,255,255,0.6)"/>
      </svg>
    )
  }

  // ── Brand Story Documentary (brand / LinkedIn) – navy blue ──
  if (template.id === 5) {
    return (
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <style>{`
            @keyframes ${id}-grow { 0%{transform:scaleY(0)} 100%{transform:scaleY(1)} }
            @keyframes ${id}-fade { 0%,100%{opacity:.3} 50%{opacity:.8} }
            @keyframes ${id}-march { 0%{stroke-dashoffset:60} 100%{stroke-dashoffset:0} }
            .${id}-bar1{animation:${id}-grow 1.2s ease-out forwards;transform-origin:center bottom}
            .${id}-bar2{animation:${id}-grow 1.4s ease-out forwards;transform-origin:center bottom}
            .${id}-bar3{animation:${id}-grow 1.6s ease-out forwards;transform-origin:center bottom}
            .${id}-fade{animation:${id}-fade 3s ease-in-out infinite}
            .${id}-march{animation:${id}-march 3s linear infinite;stroke-dasharray:6 4}
          `}</style>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a1628"/>
            <stop offset="100%" stopColor="#1e3a5f"/>
          </linearGradient>
          <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6"/>
            <stop offset="100%" stopColor="#1e40af"/>
          </linearGradient>
        </defs>
        <rect width="200" height="112" fill={`url(#${id}-bg)`}/>
        {[40,80,120,160].map(x => (
          <line key={x} x1={x} y1="10" x2={x} y2="100" stroke="rgba(59,130,246,0.06)" strokeWidth="1"/>
        ))}
        {[30,55,80].map(y => (
          <line key={y} x1="10" y1={y} x2="190" y2={y} stroke="rgba(59,130,246,0.06)" strokeWidth="1"/>
        ))}
        <rect x="25" y="50" width="20" height="38" rx="2" fill={`url(#${id}-bar)`} opacity="0.5" className={`${id}-bar1`}/>
        <rect x="52" y="35" width="20" height="53" rx="2" fill={`url(#${id}-bar)`} opacity="0.65" className={`${id}-bar2`}/>
        <rect x="79" y="22" width="20" height="66" rx="2" fill={`url(#${id}-bar)`} opacity="0.8" className={`${id}-bar3`}/>
        <polyline points="35,50 62,35 89,22 116,30 143,18 170,25" fill="none" stroke="rgba(96,165,250,0.7)" strokeWidth="1.5" strokeLinejoin="round"/>
        {[35,62,89,116,143,170].map((x,i) => {
          const ys = [50,35,22,30,18,25]
          return <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="#60a5fa" className={`${id}-fade`} style={{animationDelay:`${i*0.3}s`}}/>
        })}
        <circle cx="145" cy="60" r="8" fill="rgba(59,130,246,0.2)" stroke="rgba(96,165,250,0.4)" strokeWidth="0.8"/>
        <circle cx="145" cy="58" r="4" fill="rgba(96,165,250,0.4)"/>
        <path d="M137 75 Q145 68 153 75" fill="rgba(96,165,250,0.3)" stroke="rgba(96,165,250,0.4)" strokeWidth="0.8"/>
        <circle cx="160" cy="65" r="6" fill="rgba(59,130,246,0.15)" stroke="rgba(96,165,250,0.3)" strokeWidth="0.8"/>
        <circle cx="160" cy="63" r="3" fill="rgba(96,165,250,0.3)"/>
        <rect x="115" y="80" width="70" height="3" rx="1.5" fill="rgba(96,165,250,0.4)"/>
        <rect x="115" y="86" width="50" height="2" rx="1" fill="rgba(255,255,255,0.12)"/>
        <rect x="115" y="91" width="60" height="2" rx="1" fill="rgba(255,255,255,0.1)"/>
        <rect x="182" y="8" width="10" height="10" rx="2" fill="rgba(10,102,194,0.6)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5"/>
        <rect x="184" y="12" width="2" height="4" fill="#fff" opacity="0.8"/>
        <circle cx="185" cy="11" r="1" fill="#fff" opacity="0.8"/>
        <rect x="187" y="12" width="3" height="4" rx="1" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.8"/>
        <rect x="8" y="8" width="184" height="96" rx="4" fill="none" stroke="rgba(59,130,246,0.15)" strokeWidth="1" className={`${id}-march`}/>
      </svg>
    )
  }

  // ── Fitness Motivation Reel (ugc / Instagram) – dark ──
  if (template.id === 6) {
    return (
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <style>{`
            @keyframes ${id}-pump { 0%,100%{transform:scaleX(1)} 50%{transform:scaleX(1.05)} }
            @keyframes ${id}-glow { 0%,100%{opacity:.5} 50%{opacity:1} }
            @keyframes ${id}-wave { 0%{transform:translateX(0)} 100%{transform:translateX(-40px)} }
            .${id}-pump{animation:${id}-pump .8s ease-in-out infinite;transform-origin:center}
            .${id}-glow{animation:${id}-glow 1.5s ease-in-out infinite}
            .${id}-wave{animation:${id}-wave 3s linear infinite}
          `}</style>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a0a0a"/>
            <stop offset="100%" stopColor="#1a0a2e"/>
          </linearGradient>
          <linearGradient id={`${id}-fire`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ef4444"/>
            <stop offset="50%" stopColor="#f97316"/>
            <stop offset="100%" stopColor="#fbbf24"/>
          </linearGradient>
        </defs>
        <rect width="200" height="112" fill={`url(#${id}-bg)`}/>
        {[-20,20,60,100,140,180,220].map((x,i) => (
          <line key={i} x1={x} y1="0" x2={x-20} y2="112" stroke="rgba(239,68,68,0.06)" strokeWidth="1"/>
        ))}
        <g className={`${id}-pump`}>
          <rect x="72" y="52" width="56" height="8" rx="2" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5"/>
          <rect x="56" y="44" width="18" height="24" rx="4" fill="rgba(239,68,68,0.7)" stroke="rgba(239,68,68,0.9)" strokeWidth="0.5"/>
          <rect x="60" y="47" width="10" height="18" rx="2" fill="rgba(239,68,68,0.5)"/>
          <rect x="126" y="44" width="18" height="24" rx="4" fill="rgba(239,68,68,0.7)" stroke="rgba(239,68,68,0.9)" strokeWidth="0.5"/>
          <rect x="130" y="47" width="10" height="18" rx="2" fill="rgba(239,68,68,0.5)"/>
        </g>
        <ellipse cx="100" cy="68" rx="30" ry="8" fill="rgba(239,68,68,0.15)" className={`${id}-glow`}/>
        <g className={`${id}-wave`}>
          <polyline points="0,90 20,90 28,75 34,105 40,90 60,90 68,80 74,100 80,90 100,90 108,70 114,110 120,90 140,90 148,78 154,102 160,90 180,90 188,76 194,104 200,90 220,90 228,78 234,104 240,90" fill="none" stroke={`url(#${id}-fire)`} strokeWidth="1.5" strokeLinejoin="round"/>
        </g>
        <rect x="182" y="8" width="10" height="10" rx="3" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
        <circle cx="187" cy="13" r="2.5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7"/>
        <circle cx="189.5" cy="10.5" r="0.7" fill="rgba(255,255,255,0.6)"/>
        {[0,1,2,3].map(i => (
          <circle key={i} cx={18+i*8} cy="20" r="1.5" fill="rgba(239,68,68,0.5)" className={`${id}-glow`} style={{animationDelay:`${i*0.2}s`}}/>
        ))}
      </svg>
    )
  }

  // ── Restaurant Showcase (local / Instagram) – dark brown ──
  if (template.id === 7) {
    return (
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <style>{`
            @keyframes ${id}-steam { 0%,100%{transform:translateY(0) scaleX(1);opacity:.6} 50%{transform:translateY(-8px) scaleX(1.2);opacity:.2} }
            @keyframes ${id}-candle { 0%,100%{transform:scaleY(1) scaleX(1)} 30%{transform:scaleY(1.15) scaleX(0.85)} 60%{transform:scaleY(0.9) scaleX(1.1)} }
            @keyframes ${id}-soft { 0%,100%{opacity:.4} 50%{opacity:.8} }
            .${id}-steam{animation:${id}-steam 2s ease-in-out infinite}
            .${id}-steam2{animation:${id}-steam 2.5s ease-in-out infinite;animation-delay:.4s}
            .${id}-steam3{animation:${id}-steam 2.2s ease-in-out infinite;animation-delay:.8s}
            .${id}-candle{animation:${id}-candle 1.2s ease-in-out infinite;transform-origin:center bottom}
            .${id}-soft{animation:${id}-soft 3s ease-in-out infinite}
          `}</style>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a0a00"/>
            <stop offset="100%" stopColor="#3d1f00"/>
          </linearGradient>
          <linearGradient id={`${id}-warm`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b"/>
            <stop offset="100%" stopColor="#d97706"/>
          </linearGradient>
          <radialGradient id={`${id}-candleGlow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="200" height="112" fill={`url(#${id}-bg)`}/>
        <ellipse cx="100" cy="80" rx="100" ry="50" fill="rgba(245,158,11,0.06)"/>
        <rect x="0" y="80" width="200" height="32" fill="rgba(61,31,0,0.8)"/>
        <rect x="0" y="78" width="200" height="4" fill="rgba(245,158,11,0.15)"/>
        <ellipse cx="100" cy="82" rx="34" ry="10" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
        <ellipse cx="100" cy="82" rx="26" ry="7" fill="rgba(255,255,255,0.05)"/>
        <circle cx="96" cy="80" r="5" fill="rgba(239,68,68,0.5)" stroke="rgba(239,68,68,0.3)" strokeWidth="0.5"/>
        <circle cx="104" cy="81" r="4" fill="rgba(34,197,94,0.4)" stroke="rgba(34,197,94,0.3)" strokeWidth="0.5"/>
        <circle cx="100" cy="77" r="3" fill="rgba(245,158,11,0.5)"/>
        <path d="M94 70 Q92 62 94 55" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" className={`${id}-steam`}/>
        <path d="M100 68 Q102 60 100 53" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" className={`${id}-steam2`}/>
        <path d="M106 70 Q108 62 106 55" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" className={`${id}-steam3`}/>
        <path d="M152 80 L148 65 Q148 58 155 58 Q162 58 162 65 L158 80 Z" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
        <ellipse cx="155" cy="63" rx="5" ry="3" fill="rgba(220,38,38,0.3)"/>
        <path d="M48 80 L44 65 Q44 58 51 58 Q58 58 58 65 L54 80 Z" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
        <ellipse cx="51" cy="63" rx="5" ry="3" fill="rgba(220,38,38,0.3)"/>
        <rect x="23" y="65" width="6" height="18" rx="1" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5"/>
        <ellipse cx="26" cy="62" rx="4" ry="6" fill={`url(#${id}-warm)`} className={`${id}-candle`} opacity="0.9"/>
        <ellipse cx="26" cy="65" rx="10" ry="6" fill={`url(#${id}-candleGlow)`} className={`${id}-soft`}/>
        <rect x="10" y="10" width="180" height="2" rx="1" fill="rgba(245,158,11,0.3)"/>
        <rect x="10" y="16" width="100" height="1" rx="0.5" fill="rgba(255,255,255,0.08)"/>
        <rect x="10" y="20" width="70" height="1" rx="0.5" fill="rgba(255,255,255,0.06)"/>
        <rect x="182" y="8" width="10" height="10" rx="3" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8"/>
        <circle cx="187" cy="13" r="2.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7"/>
        <circle cx="189.5" cy="10.5" r="0.7" fill="rgba(255,255,255,0.5)"/>
      </svg>
    )
  }

  // ── App Product Demo (ads / YouTube) – dark blue ──
  if (template.id === 8) {
    return (
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <style>{`
            @keyframes ${id}-cursor { 0%,49%{opacity:1} 50%,100%{opacity:0} }
            @keyframes ${id}-ping { 0%{r:3;opacity:.8} 100%{r:10;opacity:0} }
            .${id}-cursor{animation:${id}-cursor 1s step-end infinite}
            .${id}-ping{animation:${id}-ping 2s ease-out infinite}
          `}</style>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#001628"/>
            <stop offset="100%" stopColor="#003d6b"/>
          </linearGradient>
          <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6"/>
            <stop offset="100%" stopColor="#06b6d4"/>
          </linearGradient>
        </defs>
        <rect width="200" height="112" fill={`url(#${id}-bg)`}/>
        <line x1="0" y1="30" x2="60" y2="30" stroke="rgba(59,130,246,0.15)" strokeWidth="1"/>
        <line x1="60" y1="30" x2="60" y2="10" stroke="rgba(59,130,246,0.15)" strokeWidth="1"/>
        <line x1="200" y1="80" x2="145" y2="80" stroke="rgba(6,182,212,0.15)" strokeWidth="1"/>
        <line x1="145" y1="80" x2="145" y2="100" stroke="rgba(6,182,212,0.15)" strokeWidth="1"/>
        <rect x="45" y="15" width="110" height="72" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(59,130,246,0.4)" strokeWidth="1.2"/>
        <rect x="49" y="19" width="102" height="62" rx="3" fill="rgba(0,0,0,0.7)"/>
        <rect x="49" y="19" width="102" height="10" rx="3" fill="rgba(59,130,246,0.2)"/>
        <circle cx="55" cy="24" r="2" fill="rgba(239,68,68,0.6)"/>
        <circle cx="61" cy="24" r="2" fill="rgba(245,158,11,0.6)"/>
        <circle cx="67" cy="24" r="2" fill="rgba(34,197,94,0.6)"/>
        <rect x="73" y="22" width="50" height="4" rx="2" fill="rgba(255,255,255,0.1)"/>
        <rect x="49" y="29" width="22" height="52" fill="rgba(59,130,246,0.12)"/>
        {[0,1,2,3].map(i => (
          <rect key={i} x="52" y={34+i*11} width="16" height="6" rx="2" fill={i===1?"rgba(59,130,246,0.5)":"rgba(255,255,255,0.08)"}/>
        ))}
        <rect x="74" y="32" width="74" height="6" rx="2" fill="rgba(255,255,255,0.12)"/>
        <rect x="74" y="41" width="52" height="18" rx="3" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.3)" strokeWidth="0.5"/>
        <rect x="77" y="45" width="30" height="3" rx="1.5" fill={`url(#${id}-blue)`} opacity="0.8"/>
        <rect x="77" y="50" width="20" height="2" rx="1" fill="rgba(255,255,255,0.2)"/>
        <rect x="74" y="63" width="52" height="4" rx="2" fill="rgba(255,255,255,0.06)"/>
        <rect x="74" y="63" width="38" height="4" rx="2" fill={`url(#${id}-blue)`} opacity="0.8"/>
        <rect x="114" y="61" width="1" height="8" fill="rgba(59,130,246,0.8)" className={`${id}-cursor`}/>
        <rect x="40" y="87" width="120" height="12" rx="3" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"/>
        <rect x="43" y="90" width="6" height="6" rx="1" fill="rgba(255,255,255,0.08)"/>
        <circle cx="167" cy="35" r="3" fill="rgba(59,130,246,0.6)"/>
        <circle cx="167" cy="35" r="3" fill="none" stroke="rgba(59,130,246,0.4)" strokeWidth="0.8" className={`${id}-ping`}/>
        <circle cx="167" cy="35" r="3" fill="none" stroke="rgba(59,130,246,0.2)" strokeWidth="0.8" className={`${id}-ping`} style={{animationDelay:'0.7s'}}/>
        <rect x="182" y="8" width="10" height="7" rx="2" fill="rgba(255,0,0,0.6)"/>
        <polygon points="185,9.5 185,13.5 190,11.5" fill="#fff" opacity="0.9"/>
      </svg>
    )
  }

  // Fallback
  return (
    <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" width="200" height="112" style={{ display: 'block', width: '100%', height: '100%' }}>
      <rect width="200" height="112" fill="#111"/>
    </svg>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlatformIcon({ platform, size = 12 }: { platform: string; size?: number }) {
  if (platform === 'Instagram') return <Smartphone size={size} />
  if (platform === 'TikTok') return <Smartphone size={size} />
  if (platform === 'YouTube') return <Tv2 size={size} />
  if (platform === 'LinkedIn') return <Briefcase size={size} />
  return <AtSign size={size} />
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 1 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            size={10}
            fill={i <= Math.round(rating) ? 'var(--warning)' : 'none'}
            stroke={i <= Math.round(rating) ? 'var(--warning)' : 'rgba(240,240,248,0.2)'}
            strokeWidth={1.5}
          />
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>
        {rating}
      </span>
    </div>
  )
}

function TemplateCard({ template, onUse, onPreview, compact = false }: {
  template: Template
  onUse: (t: Template) => void
  onPreview?: (t: Template) => void
  compact?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
        if (videoRef.current) {
          if (entry.isIntersecting) {
            videoRef.current.play().catch(() => {})
          } else {
            videoRef.current.pause()
          }
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.div
      ref={containerRef}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.015, y: -2 }}
      transition={{ duration: 0.15 }}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 'var(--r-xl)',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        ...(compact ? { width: 200, flexShrink: 0 } : {}),
      }}
    >
      {/* Thumbnail / Video Preview */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '16/9',
          background: template.gradient,
          overflow: 'hidden',
        }}
      >
        {/* SVG Thumbnail – shown ONLY if no video exists */}
        {!template.previewVideoUrl && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <TemplateThumbnail template={template} />
          </div>
        )}

        {/* Live Video Preview - plays inline always when visible */}
        {template.previewVideoUrl && (
          <div style={{ position: 'absolute', inset: 0, opacity: 1, pointerEvents: 'none' }}>
            <video
              ref={videoRef}
              src={template.previewVideoUrl}
              poster={template.posterUrl}
              muted
              loop
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}

        {/* Shimmer on hover */}
        <AnimatePresence>
          {hovered && !template.previewVideoUrl && (
            <motion.div
              initial={{ opacity: 0, x: '-100%' }}
              animate={{ opacity: 1, x: '100%' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>

        {/* Scene strip at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 16,
            display: 'flex',
            gap: 2,
            padding: '0 6px 4px',
          }}
        >
          {Array.from({ length: Math.min(template.scenes, 10) }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: hovered ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                borderRadius: 2,
                transition: `background 0.15s ease ${i * 20}ms`,
              }}
            />
          ))}
        </div>

        {/* Hover overlay with action buttons */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={e => { e.stopPropagation(); onPreview?.(template) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '7px 12px',
                  borderRadius: 'var(--r-md)',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <Play size={10} fill="#fff" />
                Preview
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={e => { e.stopPropagation(); onUse(template) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '7px 14px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 12px rgba(99,102,241,0.45)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Use Template
                <ArrowRight size={11} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top badges */}
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 5 }}>
          {template.isAIPick && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 7px',
                borderRadius: 'var(--r-full)',
                background: 'rgba(139,92,246,0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(167,139,250,0.4)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: '0 2px 8px rgba(139,92,246,0.4)',
              }}
            >
              <Zap size={8} fill="#fff" />
              AI Pick
            </span>
          )}
        </div>
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 7px',
              borderRadius: 'var(--r-full)',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,240,248,0.8)',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            <PlatformIcon platform={template.platform} size={9} />
            {template.platform}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {/* Name */}
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
          }}
        >
          {template.name}
        </div>

        {/* Row 1: Platform + Duration + Scenes */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[
            { icon: <Clock size={9} />, label: template.duration },
            { icon: <Film size={9} />, label: `${template.scenes} scenes` },
          ].map(({ icon, label }) => (
            <span
              key={label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 7px',
                borderRadius: 'var(--r-full)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              {icon}
              {label}
            </span>
          ))}
        </div>

        {/* Row 2: Caption + Music chips */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: 'var(--text-tertiary)',
              fontWeight: 500,
            }}
          >
            <Tag size={9} />
            {template.captionStyle}
          </span>
          <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: 'var(--text-tertiary)',
              fontWeight: 500,
            }}
          >
            <Music2 size={9} />
            {template.musicStyle}
          </span>
        </div>

        {/* Row 3: Target audience */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Users size={10} />
          {template.targetAudience}
        </div>

        {/* Row 4: Difficulty + Edit time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 'var(--r-full)',
              background: DIFFICULTY_BG[template.difficulty],
              color: DIFFICULTY_COLOR[template.difficulty],
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.03em',
            }}
          >
            {template.difficulty}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            <Clock size={9} />
            {template.editTime}
          </span>
        </div>

        {/* Row 5: Stars + Uses */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <StarRating rating={template.rating} />
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {template.uses.toLocaleString()} uses
          </span>
        </div>

        {/* CTA */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.1 }}
          onClick={() => onUse(template)}
          style={{
            width: '100%',
            height: 34,
            borderRadius: 'var(--r-md)',
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: 'var(--font-sans)',
            boxShadow: '0 1px 6px rgba(99,102,241,0.3)',
            marginTop: 2,
          }}
        >
          Use Template
          <ArrowRight size={13} />
        </motion.button>
      </div>
    </motion.div>
  )
}

// ─── Featured Hero Card ───────────────────────────────────────────────────────

function FeaturedCard({ template, onUse, onPreview }: { template: Template; onUse: (t: Template) => void; onPreview?: (t: Template) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      style={{
        borderRadius: 'var(--r-2xl)',
        overflow: 'hidden',
        background: template.gradient,
        border: '1px solid rgba(255,255,255,0.1)',
        minHeight: 240,
        display: 'flex',
        position: 'relative',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      {/* Background shimmer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Decorative grid pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }}
      />

      {/* Video Background (if available) */}
      {template.previewVideoUrl && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <video
            src={template.previewVideoUrl}
            poster={template.posterUrl}
            autoPlay
            muted
            loop
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, mixBlendMode: 'overlay' }}
          />
        </div>
      )}

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          padding: '32px 36px',
          display: 'flex',
          alignItems: 'center',
          gap: 32,
        }}
      >
        {/* Left: info */}
        <div style={{ flex: 1 }}>
          {/* AI Pick badge */}
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.2 }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                borderRadius: 'var(--r-full)',
                background: 'rgba(139,92,246,0.85)',
                border: '1px solid rgba(167,139,250,0.5)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                boxShadow: '0 2px 12px rgba(139,92,246,0.5)',
              }}
            >
              <Zap size={9} fill="#fff" />
              AI Pick · Featured
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                borderRadius: 'var(--r-full)',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(240,240,248,0.75)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <PlatformIcon platform={template.platform} size={10} />
              {template.platform}
            </span>
          </motion.div>

          {/* Template name */}
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.2 }}
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              marginBottom: 12,
              textShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}
          >
            {template.name}
          </motion.h2>

          {/* Meta badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.2 }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}
          >
            {[
              template.duration,
              `${template.scenes} scenes`,
              template.difficulty,
              template.targetAudience,
            ].map(label => (
              <span
                key={label}
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--r-full)',
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(240,240,248,0.85)',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {label}
              </span>
            ))}
          </motion.div>

          {/* Stars + uses */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.2 }}
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} size={13} fill="var(--warning)" stroke="var(--warning)" strokeWidth={1} />
              ))}
            </div>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 600 }}>
              {template.rating}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              {template.uses.toLocaleString()} uses
            </span>
          </motion.div>
        </div>

        {/* Right: CTAs */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.1 }}
            onClick={() => onUse(template)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 24px',
              borderRadius: 'var(--r-lg)',
              background: 'var(--accent)',
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
              whiteSpace: 'nowrap',
            }}
          >
            Use Template
            <ArrowRight size={15} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.1 }}
            onClick={() => onPreview?.(template)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 24px',
              borderRadius: 'var(--r-lg)',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(240,240,248,0.9)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
            }}
          >
            <Play size={13} />
            Preview
          </motion.button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
              marginTop: 2,
            }}
          >
            <Clock size={11} color="rgba(255,255,255,0.4)" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              {template.editTime} to edit
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── Before/After Section ─────────────────────────────────────────────────────

function BeforeAfterCard({
  title,
  beforeGradient,
  afterGradient,
}: {
  title: string
  beforeGradient: string
  afterGradient: string
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.015, y: -2 }}
      transition={{ duration: 0.15 }}
      style={{
        borderRadius: 'var(--r-xl)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Split preview */}
      <div style={{ display: 'flex', height: 140, position: 'relative' }}>
        {/* Before */}
        <div
          style={{
            flex: 1,
            background: beforeGradient,
            display: 'flex',
            alignItems: 'flex-end',
            padding: 10,
          }}
        >
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--r-sm)',
              background: 'rgba(0,0,0,0.6)',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            Raw footage
          </span>
        </div>

        {/* Divider + handle */}
        <div
          style={{
            width: 2,
            background: 'rgba(255,255,255,0.25)',
            position: 'relative',
            zIndex: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <ChevronRight size={8} color="#000" style={{ marginLeft: -1 }} />
          </div>
        </div>

        {/* After */}
        <div
          style={{
            flex: 1,
            background: afterGradient,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            padding: 10,
            gap: 4,
          }}
        >
          {/* Simulated caption overlay */}
          <div
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--r-sm)',
              background: 'rgba(99,102,241,0.8)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            CINEMATIC TEXT
          </div>
          <div style={{ flex: 1 }} />
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--r-sm)',
              background: 'rgba(0,0,0,0.6)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            With template
          </span>
        </div>

        {/* Before label */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '2px 8px',
            borderRadius: 'var(--r-sm)',
            background: 'rgba(0,0,0,0.55)',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          Before
        </div>
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '2px 8px',
            borderRadius: 'var(--r-sm)',
            background: 'rgba(99,102,241,0.7)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          After
        </div>
      </div>

      {/* Label */}
      <div
        style={{
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
        }}
      >
        {title}
      </div>
    </motion.div>
  )
}

// ─── Category Sections Row ────────────────────────────────────────────────────

function CategoryRow({
  templates,
  onUse,
  onPreview,
}: {
  templates: Template[]
  onUse: (t: Template) => void
  onPreview?: (t: Template) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        overflowX: 'auto',
        paddingBottom: 8,
        scrollbarWidth: 'thin',
      }}
    >
      {templates.map((template, i) => (
        <motion.div
          key={template.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05, duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          <TemplateCard template={template} onUse={onUse} onPreview={onPreview} compact />
        </motion.div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activePlatform, setActivePlatform] = useState<string | null>(null)
  const [activeSectionTab, setActiveSectionTab] = useState('most-used')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)

  // Customization & Reference state
  const [customPrompt, setCustomPrompt] = useState('')
  const [references, setReferences] = useState<ReferenceMedia[]>([])
  const [uploadingRef, setUploadingRef] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [analyzingStyle, setAnalyzingStyle] = useState(false)
  const [referenceProfile, setReferenceProfile] = useState<ReferenceStyleProfile | null>(null)
  const refFileInputRef = useRef<HTMLInputElement>(null)

  const handleUse = (template: Template) => {
    setSelectedTemplate(template)
    const reg = TEMPLATE_REGISTRY[template.id]
    const initialPrompt = reg?.editorialPrompt || promptForTemplate(template)
    setCustomPrompt(initialPrompt)
    setReferences([])
    setReferenceProfile(null)
    setUploadError(null)
  }

  const handlePreview = (template: Template) => {
    setPreviewTemplate(template)
  }

  const handleRestorePrompt = () => {
    if (!selectedTemplate) return
    const reg = TEMPLATE_REGISTRY[selectedTemplate.id]
    setCustomPrompt(reg?.editorialPrompt || promptForTemplate(selectedTemplate))
  }

  const handleReferenceFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    if (references.length + list.length > 6) {
      setUploadError("Maximum 6 reference files allowed.")
      return
    }
    setUploadError(null)
    setUploadingRef(true)

    try {
      const added: ReferenceMedia[] = []
      for (const file of list) {
        if (file.size > 50 * 1024 * 1024) {
          throw new Error(`"${file.name}" exceeds 50MB limit.`)
        }
        const isVideo = file.type.startsWith("video/") || file.name.endsWith(".mp4") || file.name.endsWith(".mov")
        const isImage = file.type.startsWith("image/")
        if (!isVideo && !isImage) {
          throw new Error(`"${file.name}" is not a supported image or video format.`)
        }

        const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'png')
        const initRes = await fetch("/api/upload-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: `ref_${Date.now()}_${file.name}`, contentType: file.type || (isVideo ? "video/mp4" : "image/png") }),
        })

        let finalUrl = ""
        if (initRes.ok) {
          const { url, publicUrl } = await initRes.json()
          await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": file.type || (isVideo ? "video/mp4" : "image/png") },
            body: file,
          })
          finalUrl = publicUrl || url.split("?")[0]
        } else {
          finalUrl = URL.createObjectURL(file)
        }

        added.push({
          id: uuidv4(),
          name: file.name,
          type: isVideo ? "video" : "image",
          url: finalUrl,
          mimeType: file.type || (isVideo ? "video/mp4" : "image/png"),
          size: file.size,
          thumbnailUrl: isImage ? URL.createObjectURL(file) : undefined,
        })
      }

      setReferences(prev => [...prev, ...added])
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload reference media")
    } finally {
      setUploadingRef(false)
    }
  }

  const handleRemoveReference = (id: string) => {
    setReferences(prev => prev.filter(r => r.id !== id))
  }

  const handleReorderReference = (index: number, direction: "left" | "right") => {
    setReferences(prev => {
      const copy = [...prev]
      const target = direction === "left" ? index - 1 : index + 1
      if (target < 0 || target >= copy.length) return prev
      const temp = copy[index]
      copy[index] = copy[target]
      copy[target] = temp
      return copy
    })
  }

  const handleAnalyzeReferences = async () => {
    if (!references.length || analyzingStyle) return
    setAnalyzingStyle(true)
    setUploadError(null)
    try {
      const res = await fetch("/api/analyze-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          references,
          templateName: selectedTemplate?.name,
          customPrompt,
        }),
      })
      const data = await res.json()
      if (data.profile) {
        setReferenceProfile(data.profile)
      }
    } catch (err: any) {
      console.warn("Style analysis error:", err)
    } finally {
      setAnalyzingStyle(false)
    }
  }

  // Map a template's target platform to an aspect ratio AIWorkspace accepts.
  const aspectRatioForPlatform = (platform: string): string => {
    switch (platform) {
      case 'Instagram':
      case 'TikTok':
        return '9:16'
      case 'YouTube':
        return '16:9'
      case 'LinkedIn':
        return '4:5'
      default:
        return '9:16'
    }
  }

  const promptForTemplate = (t: Template): string =>
    `Create a ${t.duration} ${t.platform} video in the style of "${t.name}". ` +
    `Target audience: ${t.targetAudience}. ` +
    `${t.scenes} scenes, ${t.captionStyle} captions, ${t.musicStyle} music. ` +
    `Polished, ${t.difficulty.toLowerCase()}-friendly, ready to publish.`

  // Primary action: seed generation in AI workspace carrying prompt and references
  const handleUseWithAI = () => {
    if (!selectedTemplate) return
    const payload: TemplateCustomizationPayload = {
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      customPrompt,
      references,
      referenceProfile: referenceProfile || undefined,
      updatedAt: Date.now(),
    }
    sessionStorage.setItem("vydeoai_template_customization", JSON.stringify(payload))

    const promptToSend = customPrompt.trim() || promptForTemplate(selectedTemplate)
    const ar = aspectRatioForPlatform(selectedTemplate.platform)
    const tid = selectedTemplate.id
    setSelectedTemplate(null)
    router.push(
      `/workspace/new?prompt=${encodeURIComponent(promptToSend)}&aspectRatio=${ar}&autoGenerate=1&templateId=${tid}`
    )
  }

  // Route to footage page carrying prompt and references
  const handleUseWithFootage = () => {
    if (!selectedTemplate) return
    const payload: TemplateCustomizationPayload = {
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      customPrompt,
      references,
      referenceProfile: referenceProfile || undefined,
      updatedAt: Date.now(),
    }
    sessionStorage.setItem("vydeoai_template_customization", JSON.stringify(payload))

    const tid = selectedTemplate.id
    setSelectedTemplate(null)
    router.push(`/footage?templateId=${tid}`)
  }

  const filtered = useMemo(() => {
    return TEMPLATES.filter(t => {
      const q = search.toLowerCase()
      if (
        q &&
        !t.name.toLowerCase().includes(q) &&
        !t.platform.toLowerCase().includes(q) &&
        !t.musicStyle.toLowerCase().includes(q) &&
        !t.captionStyle.toLowerCase().includes(q) &&
        !t.targetAudience.toLowerCase().includes(q) &&
        !t.category.includes(q)
      )
        return false
      if (activeCategory !== 'all' && t.category !== activeCategory) return false
      if (activePlatform && t.platform !== activePlatform) return false
      return true
    })
  }, [search, activeCategory, activePlatform])

  const featuredTemplate = TEMPLATES.find(t => t.isAIPick) ?? TEMPLATES[0]

  const sectionTemplates = useMemo(() => {
    if (activeSectionTab === 'new') return TEMPLATES.slice().reverse()
    if (activeSectionTab === 'most-used') return [...TEMPLATES].sort((a, b) => b.uses - a.uses)
    if (activeSectionTab === 'ai-picks') return TEMPLATES.filter(t => t.isAIPick)
    return TEMPLATES
  }, [activeSectionTab])

  const containerVariants: Variants = {
    animate: { transition: { staggerChildren: 0.05 } },
  }
  const itemVariants: Variants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } },
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      {/* ── Reference-Guided Template Customization Modal ── */}
      <AnimatePresence>
        {selectedTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setSelectedTemplate(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--bg-panel)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-2xl)', padding: '24px 28px', width: '100%', maxWidth: 660,
                maxHeight: '90vh', overflowY: 'auto',
                boxShadow: '0 32px 80px rgba(0,0,0,0.85)',
                display: 'flex', flexDirection: 'column', gap: 18,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: 'var(--accent-subtle)', color: 'var(--accent-light)', border: '1px solid var(--accent-border)' }}>
                      TEMPLATE
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {selectedTemplate.platform} · {selectedTemplate.duration}
                    </span>
                  </div>
                  <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>
                    Customize: {selectedTemplate.name}
                  </h2>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                    Fine-tune editorial instructions and optionally attach visual style references.
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Editorial Prompt Customizer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Editorial Brief & Prompt
                  </label>
                  {customPrompt !== (TEMPLATE_REGISTRY[selectedTemplate.id]?.editorialPrompt || promptForTemplate(selectedTemplate)) && (
                    <button
                      onClick={handleRestorePrompt}
                      style={{
                        background: 'transparent', border: 'none', color: 'var(--accent-light)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <RotateCcw size={11} />
                      Restore Default Prompt
                    </button>
                  )}
                </div>
                <textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                  }}
                  placeholder="Describe your editing vision or instructions for this template..."
                />
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  VydeoAI will use this customized brief to direct shot choices, pacing, transitions, and story structure.
                </div>
              </div>

              {/* Reference Media Upload Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Creative Style References <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(Optional)</span>
                    </label>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Upload images or videos whose aesthetic, color harmony, or pacing you want VydeoAI to emulate.
                    </div>
                  </div>
                  {references.length > 0 && (
                    <button
                      onClick={handleAnalyzeReferences}
                      disabled={analyzingStyle}
                      style={{
                        background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                        color: 'var(--accent-light)', padding: '4px 10px', borderRadius: 'var(--r-md)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {analyzingStyle ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {referenceProfile ? 'Re-Analyze Style' : 'Analyze Style Profile'}
                    </button>
                  )}
                </div>

                <input
                  ref={refFileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files) handleReferenceFiles(e.target.files)
                    e.target.value = ''
                  }}
                />

                {/* Upload Drop Zone */}
                <div
                  onClick={() => refFileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    if (e.dataTransfer.files) handleReferenceFiles(e.dataTransfer.files)
                  }}
                  style={{
                    border: '1.5px dashed var(--border-strong)',
                    borderRadius: 'var(--r-lg)',
                    padding: '16px 20px',
                    textAlign: 'center',
                    background: 'var(--bg-hover)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'border-color 0.15s',
                  }}
                >
                  {uploadingRef ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-light)', fontSize: 12 }}>
                      <Loader2 size={16} className="animate-spin" />
                      Uploading reference media...
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
                        <Upload size={14} />
                        Drop reference images or video clips here, or click to browse
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        Supports JPEG, PNG, WebP, MP4, MOV (Max 6 files, 50MB each)
                      </div>
                    </>
                  )}
                </div>

                {uploadError && (
                  <div style={{ fontSize: 11, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.1)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }}>
                    <AlertCircle size={13} />
                    {uploadError}
                  </div>
                )}

                {/* Reference List Preview */}
                {references.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 10, marginTop: 4 }}>
                    {references.map((ref, idx) => (
                      <div
                        key={ref.id}
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-md)',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative',
                        }}
                      >
                        <div style={{ height: 72, background: '#0a0a10', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                          {ref.type === 'image' && ref.thumbnailUrl ? (
                            <img src={ref.thumbnailUrl} alt={ref.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                              <VideoIcon size={20} />
                              <span style={{ fontSize: 9 }}>VIDEO</span>
                            </div>
                          )}
                          <button
                            onClick={() => handleRemoveReference(ref.id)}
                            style={{
                              position: 'absolute', top: 4, right: 4,
                              background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '50%',
                              width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff', cursor: 'pointer',
                            }}
                            title="Remove reference"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                        <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ref.name}>
                            {ref.name}
                          </span>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {idx > 0 && (
                              <button
                                onClick={() => handleReorderReference(idx, 'left')}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 1 }}
                                title="Move left"
                              >
                                <ChevronLeft size={12} />
                              </button>
                            )}
                            {idx < references.length - 1 && (
                              <button
                                onClick={() => handleReorderReference(idx, 'right')}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 1 }}
                                title="Move right"
                              >
                                <ChevronRight size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reference Style Profile Display */}
                {referenceProfile && (
                  <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 'var(--r-lg)', padding: '12px 14px', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <CheckCircle2 size={14} color="var(--accent-light)" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Extracted Style: {referenceProfile.visualMood}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {referenceProfile.summary}
                    </div>
                    {referenceProfile.colorPalette && referenceProfile.colorPalette.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Palette:</span>
                        {referenceProfile.colorPalette.map(c => (
                          <div key={c} style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.2)' }} title={c} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Choose Creation Flow
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    onClick={handleProceedWithFootage}
                    style={{
                      padding: '14px 16px', borderRadius: 'var(--r-xl)',
                      background: 'var(--accent)', border: 'none',
                      cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12,
                      color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Scissors size={16} color="#fff" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Cut with My Footage
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2, lineHeight: 1.4 }}>
                        Upload your video clips — AI edits them with these reference guidelines.
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={handleUseWithAI}
                    style={{
                      padding: '14px 16px', borderRadius: 'var(--r-xl)',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12,
                      transition: 'border-color 0.15s, background 0.15s',
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Sparkles size={16} color="var(--accent-light)" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Generate AI Visuals
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                        AI generates the visuals and music based on this template brief.
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── Template Preview Modal ── */}
        {previewTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setPreviewTemplate(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--bg-panel)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-2xl)', width: '100%', maxWidth: 760,
                maxHeight: '90vh', overflowY: 'auto',
                boxShadow: '0 32px 80px rgba(0,0,0,0.85)',
                display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 1.25fr',
                gap: 24, padding: 24,
              }}
            >
              {/* Left: Video / visual preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  width: '100%', aspectRatio: previewTemplate.platform === 'YouTube' ? '16/9' : '9/16',
                  maxHeight: 400, borderRadius: 'var(--r-xl)', overflow: 'hidden',
                  background: '#0a0a0f', border: '1px solid var(--border)',
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <video
                    src={TEMPLATE_REGISTRY[previewTemplate.id]?.previewVideoUrl || "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4"}
                    controls
                    autoPlay
                    loop
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                  Live template preview generated with VydeoAI rendering engine
                </div>
              </div>

              {/* Right: Recipe & Details */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-full)', background: 'var(--accent-subtle)', color: 'var(--accent-light)', border: '1px solid var(--accent-border)' }}>
                          {previewTemplate.category.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {previewTemplate.platform} · {previewTemplate.duration}
                        </span>
                      </div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
                        {previewTemplate.name}
                      </h2>
                    </div>
                    <button
                      onClick={() => setPreviewTemplate(null)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Creative Specification Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Pacing Profile
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {TEMPLATE_REGISTRY[previewTemplate.id]?.pacing || "Balanced Cuts"}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Music Style
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {previewTemplate.musicStyle}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Caption Style
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {previewTemplate.captionStyle} Subtitles
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Color Treatment
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {TEMPLATE_REGISTRY[previewTemplate.id]?.defaultColorGrade || "Natural"}
                      </div>
                    </div>
                  </div>

                  {/* Editorial Brief Preview */}
                  <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--r-lg)', padding: '12px 14px', marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-light)', marginBottom: 4 }}>
                      AI Editorial Recipe
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {TEMPLATE_REGISTRY[previewTemplate.id]?.editorialPrompt || `Optimized for ${previewTemplate.platform} with ${previewTemplate.captionStyle} text overlays.`}
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button
                    onClick={() => {
                      const t = previewTemplate;
                      setPreviewTemplate(null);
                      setSelectedTemplate(t);
                    }}
                    style={{
                      flex: 1, padding: '12px 18px', borderRadius: 'var(--r-lg)',
                      background: 'var(--accent)', border: 'none', color: '#fff',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
                    }}
                  >
                    Use This Template
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => setPreviewTemplate(null)}
                    style={{
                      padding: '12px 16px', borderRadius: 'var(--r-lg)',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{
          padding: '28px 32px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--bg-surface)',
        }}
      >
        {/* Title row */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <LayoutGrid size={18} color="var(--accent)" />
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              Template Marketplace
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginLeft: 28 }}>
            Professional starting points. AI-powered finishing.
          </p>
        </div>

        {/* Search + platform filters row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
            <Search
              size={14}
              color="var(--text-tertiary)"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by style, platform, or use case..."
              style={{
                width: '100%',
                height: 38,
                paddingLeft: 36,
                paddingRight: 14,
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 'var(--r-lg)',
                fontSize: 13,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
          </div>

          {/* Platform filters */}
          <div style={{ display: 'flex', gap: 6 }}>
            {PLATFORM_FILTERS.map(platform => (
              <motion.button
                key={platform}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.1 }}
                onClick={() =>
                  setActivePlatform(prev => (prev === platform ? null : platform))
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: 'var(--r-lg)',
                  background:
                    activePlatform === platform
                      ? 'var(--accent-subtle)'
                      : 'var(--bg-elevated)',
                  border: `1px solid ${
                    activePlatform === platform
                      ? 'var(--accent-border)'
                      : 'var(--border)'
                  }`,
                  color:
                    activePlatform === platform
                      ? 'var(--accent-light)'
                      : 'var(--text-tertiary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 0.15s ease',
                }}
              >
                <PlatformIcon platform={platform} size={11} />
                {platform}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Category pill tabs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {CATEGORY_TABS.map(tab => (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.1 }}
              onClick={() => setActiveCategory(tab.id)}
              style={{
                padding: '5px 14px',
                borderRadius: 'var(--r-full)',
                background:
                  activeCategory === tab.id ? 'var(--accent)' : 'var(--bg-elevated)',
                border: `1px solid ${
                  activeCategory === tab.id ? 'transparent' : 'var(--border)'
                }`,
                color:
                  activeCategory === tab.id ? '#fff' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'all 0.15s ease',
                boxShadow:
                  activeCategory === tab.id
                    ? '0 2px 8px rgba(99,102,241,0.3)'
                    : 'none',
              }}
            >
              {tab.label}
            </motion.button>
          ))}

          <div style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              alignSelf: 'center',
              paddingRight: 4,
            }}
          >
            {filtered.length} template{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </motion.div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 64px' }}>

        {/* Featured hero (only when no filters active) */}
        {activeCategory === 'all' && !search && !activePlatform && (
          <div style={{ marginBottom: 32 }}>
            <FeaturedCard template={featuredTemplate} onUse={handleUse} onPreview={handlePreview} />
          </div>
        )}

        {/* Main grid */}
        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="empty-state"
            >
              <div className="empty-state-icon">
                <Search size={20} color="var(--text-tertiary)" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                No templates match your search
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 280, textAlign: 'center' }}>
                Try different keywords or clear your filters to browse all templates.
              </p>
              <button
                onClick={() => {
                  setSearch('')
                  setActiveCategory('all')
                  setActivePlatform(null)
                }}
                className="btn btn-secondary btn-sm"
              >
                Clear filters
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              variants={containerVariants}
              initial="initial"
              animate="animate"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 20,
              }}
            >
              {filtered.map(template => (
                <motion.div key={template.id} variants={itemVariants}>
                  <TemplateCard template={template} onUse={handleUse} onPreview={handlePreview} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Before / After Section */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          style={{ marginTop: 52 }}
        >
          {/* Section header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.015em',
                  marginBottom: 4,
                }}
              >
                See the transformation
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                From raw footage to publish-ready in minutes.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <BeforeAfterCard
              title="Luxury Product Showcase"
              beforeGradient="linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)"
              afterGradient="linear-gradient(135deg, #0d0d1a 0%, #2d1b69 100%)"
            />
            <BeforeAfterCard
              title="Cinematic Travel Reel"
              beforeGradient="linear-gradient(135deg, #111 0%, #222 100%)"
              afterGradient="linear-gradient(135deg, #0f2027 0%, #2c5364 100%)"
            />
            <BeforeAfterCard
              title="App Product Demo"
              beforeGradient="linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)"
              afterGradient="linear-gradient(135deg, #001628 0%, #003d6b 100%)"
            />
          </div>
        </motion.div>

        {/* ── Categories Section ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          style={{ marginTop: 52 }}
        >
          {/* Section header */}
          <div style={{ marginBottom: 20 }}>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.015em',
                marginBottom: 16,
              }}
            >
              Browse by category
            </h2>

            {/* Section tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {SECTION_TABS.map(tab => {
                const Icon = tab.icon
                const isActive = activeSectionTab === tab.id
                return (
                  <motion.button
                    key={tab.id}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.1 }}
                    onClick={() => setActiveSectionTab(tab.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 14px',
                      borderRadius: 'var(--r-md)',
                      background: isActive ? 'var(--bg-elevated)' : 'transparent',
                      border: `1px solid ${isActive ? 'var(--border-strong)' : 'transparent'}`,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Icon size={12} color={isActive ? 'var(--accent-light)' : undefined} />
                    {tab.label}
                  </motion.button>
                )
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeSectionTab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            >
              <CategoryRow templates={sectionTemplates} onUse={handleUse} onPreview={handlePreview} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
