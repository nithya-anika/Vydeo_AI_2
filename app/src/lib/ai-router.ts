/**
 * AI Model Router — central model config for VydeoAI.
 * All model IDs and generation configurations route through this module.
 *
 * Current Verified Production Baseline:
 * - Deep Editorial, Vision & Planning: gemini-3.1-pro-preview (Global Vertex AI endpoint)
 * - Storyboard & Candidate Selection: gemini-3.1-pro-preview (Global Vertex AI endpoint)
 * - Fast Conversational Turns & Subtitles: gemini-3.8-flash (Global Vertex AI endpoint)
 * - Quality & Evaluator Reviewer: gemini-4-argon (Global Vertex AI endpoint)
 * - Verified Production Fallback: gemini-3.6-flash (Global Vertex AI endpoint)
 * - Reviewer Fallback: gemini-3.8-flash (Global Vertex AI endpoint)
 */

export const AI_MODELS = {
  // Planning & structured reasoning
  planning: process.env.VYDEO_MODEL_PLANNING || 'gemini-3.1-pro-preview',
  // Fast conversational turns
  chat: process.env.VYDEO_MODEL_CHAT || 'gemini-3.8-flash',
  // Storyboard / candidate selection
  storyboard: process.env.VYDEO_MODEL_STORYBOARD || 'gemini-3.1-pro-preview',
  // Clarifying questions (fast, cheap)
  clarify: process.env.VYDEO_MODEL_CLARIFY || 'gemini-3.8-flash',
  // Video QA evaluation & compliance auditing
  evaluate: process.env.VYDEO_MODEL_EVALUATE || 'gemini-4-argon',
  // Image generation
  imageGen: 'imagen-4.0-generate-preview-05-20',
  // Video generation
  videoGen: 'veo-3.0-generate-preview',
  // Video generation fallback
  videoGenFallback: 'veo-2.0-generate-001',
  // Embeddings / semantic search
  embeddings: 'text-embedding-005',
  // Vision / multimodal analysis
  vision: process.env.VYDEO_MODEL_VISION || 'gemini-3.1-pro-preview',
} as const

export const FALLBACK_MODELS = {
  primary: 'gemini-3.6-flash',
  reviewer: 'gemini-3.8-flash',
} as const

export type AITask = keyof typeof AI_MODELS
export type AIModel = (typeof AI_MODELS)[AITask]

// In-memory runtime overrides for testing, benchmarking, and fallbacks
const runtimeOverrides = new Map<AITask, string>()
let fallbackModeActive = false
let rollbackModeActive = false

/**
 * Temporarily override the model for a specific task.
 */
export function setModelOverride(task: AITask, model: string | null | undefined): void {
  if (model) {
    runtimeOverrides.set(task, model)
  } else {
    runtimeOverrides.delete(task)
  }
}

/**
 * Engages modern verified safety fallback (Gemini 3.5 Flash) without relying on retired models.
 */
export function engageVerifiedSafetyFallback(): void {
  fallbackModeActive = true
  runtimeOverrides.set('planning', FALLBACK_MODELS.primary)
  runtimeOverrides.set('chat', FALLBACK_MODELS.primary)
  runtimeOverrides.set('storyboard', FALLBACK_MODELS.primary)
  runtimeOverrides.set('clarify', FALLBACK_MODELS.primary)
  runtimeOverrides.set('evaluate', FALLBACK_MODELS.reviewer)
  runtimeOverrides.set('vision', FALLBACK_MODELS.primary)
}

/**
 * Activates legacy rollback to Gemini 2.5 baseline (deprecated).
 */
export function rollbackToLegacyDefaults(): void {
  rollbackModeActive = true
  runtimeOverrides.set('planning', 'gemini-2.5-pro')
  runtimeOverrides.set('chat', 'gemini-2.5-flash')
  runtimeOverrides.set('storyboard', 'gemini-2.5-pro')
  runtimeOverrides.set('clarify', 'gemini-2.5-flash')
  runtimeOverrides.set('evaluate', 'gemini-2.5-pro')
  runtimeOverrides.set('vision', 'gemini-2.5-pro')
}

/**
 * Restores modern verified production defaults (Gemini 3.8 Flash / Gemini 4 Argon).
 */
export function restoreProductionDefaults(): void {
  fallbackModeActive = false
  rollbackModeActive = false
  runtimeOverrides.clear()
}

/** Check if fallback or rollback mode is active. */
export function isFallbackActive(): boolean {
  return fallbackModeActive
}

export function isRollbackActive(): boolean {
  return rollbackModeActive
}

/** Clear all runtime model overrides. */
export function resetModelOverrides(): void {
  fallbackModeActive = false
  rollbackModeActive = false
  runtimeOverrides.clear()
}

/** Get the current active model ID for a given task. */
export function getModel(task: AITask, override?: string): string {
  if (override) return override
  if (runtimeOverrides.has(task)) {
    return runtimeOverrides.get(task)!
  }
  return AI_MODELS[task]
}

/** Veo model preference list (primary → fallback). */
export const VEO_MODELS = [
  AI_MODELS.videoGen,
  AI_MODELS.videoGenFallback,
] as const

/**
 * Gemini generation config presets.
 */
export const GEN_CONFIG = {
  planning: {
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingLevel: 'LOW' },
  },
  chat: {
    maxOutputTokens: 2048,
    thinkingConfig: { thinkingLevel: 'LOW' },
  },
  storyboard: {
    maxOutputTokens: 16384,
    thinkingConfig: { thinkingLevel: 'MEDIUM' },
  },
  clarify: {
    maxOutputTokens: 1024,
    thinkingConfig: { thinkingLevel: 'LOW' },
  },
  evaluate: {
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingLevel: 'MEDIUM' },
  },
  json: {
    responseMimeType: 'application/json' as const,
  },
} as const
