<<<<<<< HEAD
# VydeoAI

AI-powered video editor for marketing teams, agencies, and content creators.

## Overview

VydeoAI is a full-stack Next.js application that combines AI-assisted video production with a professional non-linear editing interface. Describe your video in plain English and get a complete scene-by-scene timeline in seconds.

## Features

### AI
- **AI Lineup Generator** — Describe your video; Gemini generates a full scene timeline (labels, descriptions, durations, transitions, mood)
- **AI Chat Assistant** — Floating chat that understands intent: "add transitions", "make it faster", "generate captions"
- **Quick Actions** — One-click AI actions for captions, pacing, transitions, mood
- **Script to Video** — Paste a script and get a full video structure

### Editor
- **Multi-track Timeline** — Video, audio, and caption tracks with zoom (0.25×–8×) and drag-resize clips
- **Canvas Preview** — Live playback with RAF-based ticker, transport controls, volume
- **Scene Inspector** — Aspect ratio, duration, label, mood, add/delete per scene
- **Caption Overlay** — Animated captions with font, size, color, alignment, timing

### Studios (Left Panel Tabs)
| Tab | Features |
|-----|----------|
| **Media** | Drag & drop upload, video/image thumbnails, auto-fill scenes |
| **Text** | Per-scene captions, 9 fonts, animations (fade, slide, typewriter), color/style controls |
| **Music** | Upload tracks + royalty-free library, volume/fade controls per track |
| **Transitions** | 14 transition types across 5 categories, duration slider, apply-to-all |
| **Brand Kit** | Logo upload, color palette presets, typography, live preview |
| **AI Tools** | Inline AI with quick prompts, runs against Gemini API |

### Pages
- **Home** — Project dashboard with stats, filters, grid/list view, new project modal
- **Templates** — 8 ready-to-use templates (Fashion, Marketing, Social, Branding, Real Estate, Events) with real pre-built scenes and captions
- **Assets** — Media library with upload, filter by type, grid and list views
- **Music** — Royalty-free library with mood/genre filters + custom upload
- **Brand Kit** — Full brand identity manager with multiple kit support and live preview
- **AI Tools** — Dedicated AI tools hub
=======
# VydeoAI — AI-First Creative Operating System

> The world's most intuitive AI-first video creation platform for marketing teams, agencies, startups, and content creators.

---

## Philosophy

**AI is the primary interaction. Timeline is the refinement interface.**

- Users describe an idea in natural language
- AI builds a complete, professional storyboard in seconds
- Users refine through conversation, then fine-tune in the editor
- Every UI action has a natural language equivalent

---

## User Flow

```
Login → Home → AI Workspace → Generation → Version Selection → Professional Editor → Export
```

The Editor is **never** the first experience. AI Workspace **always** comes first.

---

## What's New (June 2026)

### AI Workspace (NEW)
The heart of VydeoAI. A dedicated creative space at `/workspace` where:
- **Prompt input** is always visible — never disappears
- **Multiple versions** can be generated and compared side-by-side
- **Storyboard view** shows every scene with captions, transitions, and mood
- **AI Plan panel** explains the narrative structure and reasoning
- **Prompt history** for quick reuse
- **Reference file uploads** for visual inspiration
- **Refinement bar** — type follow-up instructions to iterate

### Rebuilt Home Page
A guide-first experience with 12 sections:
- Continue Editing, Create with AI, Recent AI Generations, Recent Drafts
- Trending Templates, Prompt Library, Brand Kit, Learn VydeoAI
- Community Inspiration, Latest Updates, Quick Actions
- **First-time user walkthrough** — interactive 4-step onboarding

### Projects Page
Dedicated project management (not the home page):
- Folder sidebar (Marketing, Branding, Social Media, etc.)
- Tabs: Recent, Drafts, Versions, Archived, Shared
- Search, sort (last edited / name / scenes), status filter
- Grid + List view toggle
- Per-project context menu (Open, Duplicate, Archive, Delete)
- Autosave indicator on every project

### Professional Timeline
- **Vertical resize** — drag the top edge to resize the panel
- **Fullscreen mode** — expand timeline for detailed editing
- **Dock / Undock** toggle
- **Timeline Minimap** — birds-eye view with viewport window
- **Track Lock / Hide / Collapse / Rename** per track
- **Track Colors** with mood-based clip colors
- **Timeline Markers** — add named markers at current time
- **Horizontal zoom** (0.1× to 10×) with FIT button
- **Waveforms** on audio tracks with type-based colors (BGM/Voice/SFX)
- **Clip thumbnails** strip on video scenes
- **Caption dots** on scene clips showing how many captions exist
- **Playhead** with glowing circle indicator
- **Ruler** with click-to-seek

### Template Marketplace
- **Product cards** with full metadata (duration, scenes, platform, difficulty, etc.)
- **Hover overlay** with Preview + Use buttons
- **Scene breakdown** modal preview
- **Star ratings** with review counts
- **AI Recommended** section
- Filters: Category, Platform, Format, Difficulty
- 8 fully designed templates (Luxury Product Reveal, Brand Story, TikTok Hook, Corporate Explainer, Fashion Lookbook, App Demo, Event Hype, Wellness)

### Design System v2
- Complete CSS variable overhaul for consistent tokens
- New animation classes: `animate-fade-in`, `animate-fade-up`, `animate-scale-in`, `animate-pulse-ai`
- `ai-thinking` dot animation component
- `gen-progress` gradient progress bar
- `scene-card`, `version-card` shared UI primitives
- `glass` utility for backdrop blur panels
- Skeleton shimmer for loading states
- Stagger animation for lists

---

## Features

### AI Layer
- **Gemini 2.5 Flash** for scene generation via `/api/lineup`
- **Demo fallback** — works without API key using sample content
- **AI Creative Director personality** — explains decisions, suggests alternatives
- **Prompt refinement** — iterate via conversation
- Multiple version generation with comparison

### Editor (editor2)
- Multi-track timeline (Video, Audio, Captions)
- Left panel with 6 studio tabs: Media, Text, Music, Transitions, Brand, AI
- Center canvas with scene preview and transport controls
- Right panel: AI assistant + inspector
- Zustand global state (`editorStore.ts`)
- Aspect ratios: 9:16, 16:9, 1:1, 4:5

### Other Pages
- `/brand-kit` — Multi-kit management with color presets and typography
- `/assets` — Media library with upload, filter, grid/list view
- `/music` — Royalty-free track library + custom uploads
- `/ai-tools` — Batch AI operations (captions, transitions, pacing, music match)

---
>>>>>>> 2e59f08 (First save)

## Tech Stack

| Layer | Technology |
<<<<<<< HEAD
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Custom CSS design system (CSS variables) |
| State | Zustand |
| AI | Google Gemini 2.5 Flash (REST API) |
| Auth | JWT sessions (`jose`) + MongoDB |
| Database | MongoDB |
| Video Render | FFmpeg (server-side) |
| Testing | Vitest + jsdom |
=======
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Custom CSS variables (no Tailwind) |
| Animations | Framer Motion + CSS keyframes |
| AI | Google Gemini 2.5 Flash |
| State | Zustand (`editorStore`) |
| Auth | JWT (`jose`) + Next.js middleware |
| Database | MongoDB |
| Video | FFmpeg (server-side render) |
| Testing | Vitest + Testing Library |

---
>>>>>>> 2e59f08 (First save)

## Project Structure

```
<<<<<<< HEAD
app/
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login, signup pages
│   │   ├── (protected)/       # All authenticated pages
│   │   │   ├── page.tsx       # Home dashboard
│   │   │   ├── editor/[id]/   # Editor route
│   │   │   ├── templates/     # Template gallery
│   │   │   ├── assets/        # Asset manager
│   │   │   ├── music/         # Music library
│   │   │   ├── brand-kit/     # Brand identity
│   │   │   └── ai-tools/      # AI tools hub
│   │   ├── api/               # API routes
│   │   │   ├── lineup/        # AI scene generation
│   │   │   ├── render/        # FFmpeg video export
│   │   │   ├── projects/      # Project CRUD
│   │   │   └── auth/          # Login/signup/logout
│   │   └── globals.css        # Design system
│   ├── components/
│   │   ├── editor2/           # Full editor (new)
│   │   │   ├── EditorShell.tsx
│   │   │   ├── TopBar.tsx
│   │   │   ├── AIChat.tsx
│   │   │   ├── panels/        # Media, Text, Music, Transitions, Brand, AI tabs
│   │   │   ├── canvas/        # CanvasPreview + SceneVisual
│   │   │   ├── timeline/      # Multi-track timeline
│   │   │   └── inspector/     # Contextual inspector
│   │   └── layout/
│   │       └── AppShell.tsx   # Sidebar + topbar layout
│   ├── store/
│   │   └── editorStore.ts     # Zustand store (all editor state)
│   └── __tests__/             # Vitest tests
│       ├── editorStore.test.ts
│       └── utils.test.ts
└── vitest.config.ts
```

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- FFmpeg (`brew install ffmpeg` on macOS)
- Google Gemini API key

### Setup

```bash
# Clone and install
cd app
npm install

# Create environment file
cp .env.example .env.local
```

Edit `.env.local`:
```env
MONGODB_URI=mongodb://localhost:27017/vydeoai
JWT_SECRET=your-secret-key-min-32-chars
GEMINI_API_KEY=your-gemini-api-key
GOOGLE_SERVICE_ACCOUNT_EMAIL=optional
GOOGLE_PRIVATE_KEY=optional
```

### Run

```bash
npm run dev      # Development server → http://localhost:3000
npm run build    # Production build
npm start        # Production server
```

### Test

```bash
npm test          # Run all tests once
npm run test:watch  # Watch mode
```

## Design System

The app uses a custom CSS variable–based design system (see `globals.css`):

- **Theme**: Dark, neutral background (`#0C0C0F`) with soft indigo accent (`#6366F1`)
- **Typography**: Inter, system-ui
- **Spacing**: 4px base grid (`--sp-1` through `--sp-16`)
- **Radii**: `--r-xs` (4px) → `--r-xl` (20px)
- **Shadows**: 5 elevation levels
- **Motion**: Spring-eased transitions, RAF playback

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | Authenticate user, return JWT |
| `/api/auth/signup` | POST | Create account |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/projects` | GET | List projects |
| `/api/projects` | POST | Create project |
| `/api/projects/[id]` | GET/PATCH/DELETE | Project CRUD |
| `/api/lineup` | POST | AI scene generation via Gemini |
| `/api/render` | POST | FFmpeg video export |

## n8n Workflows (Backend)

Automation workflows are handled server-side via n8n webhooks. Set these environment variables to enable:

```env
N8N_WEBHOOK_URL=https://your-n8n-instance/webhook
N8N_API_KEY=your-n8n-api-key
```

Supported automations: auto-caption, brand-check, multi-platform resize, Slack notifications, scheduled regeneration, auto-publish.

## Testing

Tests cover:
- **Editor store** — all CRUD operations (scenes, clips, audio, captions, brand kit, playback, zoom)
- **Utilities** — duration formatting, file size formatting, time-ago, aspect ratio calculator, clamp

```
✓ 196 tests passing across 13 test files
```

## Changelog

### Latest
- Rebranded FRAMEAI → **VydeoAI**
- New simple & elegant theme (indigo accent, clean dark surfaces)
- Removed n8n from UI — moved to backend-only
- Rebuilt AI Tools page with consistent UI
- Fixed Templates — real pre-built scenes load into editor
- Added Vitest test suite (196 tests)
- `/projects`, `/assets`, `/music`, `/templates` pages
- Fixed redirect loop at root `/`
=======
app/src/
├── app/
│   ├── (auth)/login/         Login page
│   ├── (auth)/signup/        Signup page
│   ├── (protected)/
│   │   ├── page.tsx          Home (guide-first, 12 sections)
│   │   ├── workspace/        AI Workspace (create flow)
│   │   │   └── [id]/         Project-specific workspace
│   │   ├── editor/[id]/      Professional Editor
│   │   ├── projects/         Project management
│   │   ├── templates/        Template marketplace
│   │   ├── brand-kit/        Brand identity management
│   │   ├── assets/           Media library
│   │   ├── music/            Music library
│   │   └── ai-tools/         Batch AI operations
│   ├── api/
│   │   ├── lineup/           AI scene generation
│   │   ├── projects/         Project CRUD
│   │   ├── render/           Server-side FFmpeg render
│   │   └── auth/             Auth endpoints
│   └── globals.css           Design system tokens + utilities
├── components/
│   ├── layout/AppShell.tsx   Sidebar + topbar shell
│   ├── workspace/            AI Workspace components
│   │   └── AIWorkspace.tsx   Full workspace UI
│   ├── editor2/              Professional editor components
│   │   ├── EditorShell.tsx   Main editor layout
│   │   ├── TopBar.tsx        Editor toolbar
│   │   ├── panels/           Left panel studio tabs
│   │   ├── canvas/           Preview + playback
│   │   ├── timeline/         Professional timeline
│   │   └── inspector/        Contextual inspector
│   └── ui/icons.tsx          Icon system
├── store/
│   └── editorStore.ts        Zustand global state
└── __tests__/                Vitest test suite
```

---

## Getting Started

```bash
# Install
cd app && npm install

# Environment
cp .env.example .env.local
# Set GEMINI_API_KEY, MONGODB_URI, JWT_SECRET

# Dev
npm run dev

# Build
npm run build

# Test
npm test
```

---

## Environment Variables

```env
GEMINI_API_KEY=           # Google Gemini API key
MONGODB_URI=              # MongoDB connection string
JWT_SECRET=               # JWT signing secret (32+ chars)
N8N_WEBHOOK_URL=          # n8n webhook (optional, backend only)
```

---

## Design Principles

1. **AI first, UI second** — every feature accessible via natural language
2. **Never overwhelm** — progressive disclosure, contextual panels
3. **No dead ends** — every page educates or creates value
4. **First-time success** — any user can go from idea to export without help
5. **Performance** — lazy loading, virtualized timeline, autosave, 60fps
>>>>>>> 2e59f08 (First save)
