/**
 * Workflow Orchestrator
 *
 * Replaces the old hardcoded if/else pipeline with a planner-driven execution engine.
 *
 * Flow:
 *   1. Planner agent → selects workflow + tool execution plan
 *   2. Tool executor → runs each tool in the plan, passes results forward
 *   3. Evaluator → scores the output before returning
 *   4. Persist → save run, tool trace, evaluation, generation to SQLite
 *
 * No routing logic lives here. The Planner decides everything.
 *
 * Backward compat: exports WorkflowCluster, AgentStep, PipelineResult
 * with updated shapes so existing callers work unchanged.
 */

import { v4 as uuidv4 } from "uuid";
import type { BrandWorkspace } from "@/types/brand";
import type { Timeline, LineupResponse } from "@/types/timeline";
import type { GeminiClip, ClipAssignment, BrandOverrides } from "./gemini";
import { runPlanner } from "./agents/planner";
import { runEvaluator } from "./agents/evaluator";
import { interpretBrief, formatBriefForPrompt } from "./agents/brief-interpreter";
import type { StructuredBrief } from "./agents/brief-interpreter";
import { getDefaultWorkflow, getWorkflow } from "./workflows/registry";
import { TEMPLATES } from "./templates/registry";
import {
  videoAnalysisTool, hookDetectionTool, timelineGeneratorTool,
  transitionPlannerTool, captionGeneratorTool, musicSelectorTool,
} from "./tools";
import type { ToolContext } from "./tools/types";
import { validateAndRepairTimeline } from "./pipeline-guards";
import { transcribeClipWithGemini } from "./transcription";
import { MUSIC_LIBRARY } from "@/types/music";
import type { ReferenceMedia, ReferenceStyleProfile } from "@/types/references";
import { analyzeReferences } from "./reference-analysis";
import {
  saveGeneration, saveWorkflowRun, saveToolExecution, saveEvaluationResult,
  getSimilarGenerations,
} from "./db";

// ── Public types (backward-compatible) ───────────────────────────────────────

export type WorkflowCluster = "ugc-ads" | "travel-cinematic";

export interface AgentStep {
  stage: string;
  model: string;
  durationMs: number;
  decision?: string;
}

export interface PipelineResult {
  cluster: WorkflowCluster;
  mode: "editorial" | "concept";
  workflowId: string;
  trace: AgentStep[];
  timeline: Timeline;
  suggestions: LineupResponse["suggestions"];
  clipAssignments?: ClipAssignment[];
  evaluation?: {
    overallScore: number;
    passedQA: boolean;
    improvements: string[];
    issues: string[];
    compliments: string[];
    timestampViolations?: import("./pipeline-guards").TimestampViolation[];
    criteriaScores: Array<{ criterion: string; score: number; rating: string; notes: string }>;
    platformScores: Array<{ platform: string; score: number; rating: string; insight: string }>;
  };
  musicSpec?: { genre: string; searchKeywords: string[]; editorialNote: string };
  referenceProfile?: ReferenceStyleProfile;
  dbSaved: boolean;
}

// ── Explicit model registry (sourced from ai-router for single point of truth) ─
import { getModel } from "@/lib/ai-router";
export const MODELS = {
  PLANNER:            getModel("planning"),
  CONCEPT_GENERATOR:  getModel("planning"),
  EDITORIAL_ANALYZER: getModel("planning"),
  HOOK_DETECTOR:      getModel("planning"),
  TRANSITION_PLANNER: getModel("planning"),
  CAPTION_GENERATOR:  getModel("planning"),
  MUSIC_SELECTOR:     getModel("planning"),
  QA_VALIDATOR:       getModel("evaluate"),
} as const;

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runAgentPipeline(params: {
  prompt: string;
  brand: BrandWorkspace;
  clips?: GeminiClip[];
  aspectRatio?: string;
  overrides?: BrandOverrides;
  workspaceSlug: string;
  runQA?: boolean;
  templateId?: string | number;
  references?: ReferenceMedia[];
  referenceProfile?: ReferenceStyleProfile;
}): Promise<PipelineResult> {
  const { prompt, brand, clips = [], aspectRatio, overrides, workspaceSlug, templateId, references, referenceProfile } = params;
  const runId = uuidv4();
  const hasClips = clips.length > 0;
  const pipelineStart = Date.now();
  const trace: AgentStep[] = [];
  const toolsExecuted: string[] = [];

  const template = templateId ? TEMPLATES[Number(templateId)] : undefined;
  
  // ── Step 0: Analyze reference media if provided ─────────────────────────────
  let activeRefProfile = referenceProfile;
  if (!activeRefProfile && references && references.length > 0) {
    const refStart = Date.now();
    activeRefProfile = (await analyzeReferences(references, template?.name, prompt)) ?? undefined;
    trace.push({
      stage: "Reference Media Analyzer",
      model: getModel("vision"),
      durationMs: Date.now() - refStart,
      decision: `${references.length} reference file(s) analyzed → ${activeRefProfile?.visualMood ?? "Stylistic profile ready"}`,
    });
  }

  // Combine user prompt with template editorial instructions and reference guidelines
  let referenceSnippet = "";
  if (activeRefProfile) {
    referenceSnippet = `\nREFERENCE STYLE GUIDELINES: Mood: ${activeRefProfile.visualMood} | Lighting: ${activeRefProfile.lightingStyle} | Pacing: ${activeRefProfile.pacingPreference} | Music Energy: ${activeRefProfile.musicEnergy ?? "medium"}`;
  }

  const effectivePrompt = template 
    ? `TEMPLATE INSTRUCTION: ${template.editorialPrompt}${referenceSnippet}\n\nUSER PROMPT: ${prompt}`
    : `${prompt}${referenceSnippet}`;

  // ── Step 1: Planner + Brief Interpreter in parallel ─────────────────────────
  // These two are independent — brief interpreter only reads the prompt text,
  // planner only reads metadata. Running together saves one round-trip latency.
  const phase1Start = Date.now();
  const [plan, briefResult] = await Promise.all([
    runPlanner({
      prompt: effectivePrompt,
      hasClips,
      clipCount: clips.length,
      workspaceSlug,
      brandName: brand.name,
      brandKeywords: brand.styleKeywords,
    }),
    interpretBrief(effectivePrompt).catch(() => null as StructuredBrief | null),
  ]);
  const phase1Ms = Date.now() - phase1Start;

  trace.push({
    stage: "Planner",
    model: MODELS.PLANNER,
    durationMs: phase1Ms,
    decision: `→ ${plan.cluster}/${plan.mode} | workflow: ${plan.workflowId} | tools: [${plan.tools.map(t => t.toolName).join(", ")}]`,
  });
  toolsExecuted.push("planner");

  const structuredBrief: StructuredBrief | undefined = briefResult ?? undefined;
  if (structuredBrief) {
    trace.push({
      stage: "Brief Interpreter",
      model: MODELS.PLANNER,
      durationMs: phase1Ms,
      decision: `${structuredBrief.coreIntent} | pacing: ${structuredBrief.pacingIntent} | ${structuredBrief.sceneOrder.length} scene directives`,
    });
  } else {
    trace.push({ stage: "Brief Interpreter (skipped)", model: "—", durationMs: phase1Ms, decision: "fallback to raw prompt" });
  }

  const workflow = getWorkflow(plan.workflowId) ?? getDefaultWorkflow(plan.cluster);
  const ctx: ToolContext = { runId, workspaceSlug, cluster: plan.cluster, mode: plan.mode };
  
  // Inject hard template constraints directly into the prompt so the timeline generator is forced to obey
  let templateDirectives = "";
  if (template) {
    templateDirectives = `
━━━ TEMPLATE CONSTRAINTS ━━━
Pacing: ${template.pacing}
Hook Strategy: ${template.hookStrategy}
Ending Strategy: ${template.endingStrategy}
Target Duration: ${template.targetDurationMin}s to ${template.targetDurationMax}s
Allowed Transitions: ${template.supportedTransitions.join(", ")}
Color Grade: ${template.defaultColorGrade || "None"}
Caption Style: ${template.captionStyle} (Align: ${template.captionAlign}, Anim: ${template.captionAnimation})
Music Style: ${template.musicStyle} (${template.musicEnergy} energy)
    `.trim() + "\n\n";
  }

  // Inject reference directives if reference media was analyzed
  let referenceDirectives = "";
  if (activeRefProfile) {
    referenceDirectives = `
━━━ CREATIVE REFERENCE STYLE GUIDELINES ━━━
Visual Mood: ${activeRefProfile.visualMood}
Lighting: ${activeRefProfile.lightingStyle}
Color Palette: ${activeRefProfile.colorPalette?.join(", ") || "Derived from references"}
Pacing Preference: ${activeRefProfile.pacingPreference}
Transition Pattern: ${activeRefProfile.transitionStyle}
Caption Placement: ${activeRefProfile.captionPlacement || "Lower third"} (${activeRefProfile.captionTypography || "Clean"})
Music Energy: ${activeRefProfile.musicEnergy || "medium"}
Directives:
${(activeRefProfile.creativeDirectives || []).map(d => `- ${d}`).join("\n")}
Reference Summary: ${activeRefProfile.summary}
CRITICAL SAFETY MANDATE: Reference media is strictly for stylistic guidance. Do NOT invent clips or copy scenes from the references. Edit ONLY the user's provided clips.
    `.trim() + "\n\n";
  }

  const enrichedPrompt = structuredBrief
    ? `${templateDirectives}${referenceDirectives}${effectivePrompt}\n\n━━━ STRUCTURED INTERPRETATION ━━━\n${formatBriefForPrompt(structuredBrief)}`
    : `${templateDirectives}${referenceDirectives}${effectivePrompt}`;

  // ── Retrieve past examples from memory ─────────────────────────────────────
  const pastGens = await getSimilarGenerations({ workspaceSlug, cluster: plan.cluster, workflowId: workflow.id, limit: 2 });
  const pastExamples = pastGens.length > 0
    ? pastGens.map((g, i) => `Example ${i + 1} (score ${g.eval_score ?? g.qa_score ?? "?"}): "${g.prompt_text.slice(0, 80)}…"`).join("\n")
    : undefined;

  // ── Step 3: Execute tool plan ──────────────────────────────────────────────
  let videoAnalysisResult = undefined;
  let hookResult = undefined;
  let timeline: Timeline | null = null;
  let suggestions: LineupResponse["suggestions"] = undefined;
  let clipAssignments: ClipAssignment[] = [];
  let musicSpec = undefined;
  let capturedTimestampViolations: import("./pipeline-guards").TimestampViolation[] = [];

  for (const { toolName, reason } of plan.tools) {
    let t0 = Date.now();

    try {
      if (toolName === "video-analysis" && hasClips) {
        const result = await videoAnalysisTool.execute({ clips }, ctx);
        void saveToolExecution({ runId, toolName, modelUsed: result.modelUsed, durationMs: result.durationMs, success: result.success, errorMsg: result.error });
        if (result.success && result.data) videoAnalysisResult = result.data;
        trace.push({
          stage: "Video Analysis",
          model: result.modelUsed ?? MODELS.EDITORIAL_ANALYZER,
          durationMs: result.durationMs,
          decision: result.data ? `${result.data.editableClipCount} usable clips | quality: ${result.data.overallQuality} | ${result.data.suggestedCluster}` : "fallback metadata",
        });
        toolsExecuted.push(toolName);

        // Audio-aware trimming: Transcribe audio for clips with video/audio data
        const transcribableClips = clips.filter(c => c.data && !c.speechSegments);
        if (transcribableClips.length > 0) {
          const transStart = Date.now();
          await Promise.allSettled(
            transcribableClips.map(async (clip) => {
              try {
                const res = await transcribeClipWithGemini({
                  base64Data: clip.data!,
                  mimeType: clip.mimeType || "video/mp4",
                  duration: clip.duration ?? 10,
                  clipIndex: clip.index,
                  clipId: clip.id,
                });
                clip.transcriptionStatus = res.status;
                clip.speechSegments = res.segments;
                clip.transcript = res.fullTranscript;
                clip.transcriptionError = res.error;
              } catch (err: any) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.warn(`[pipeline:transcribe] Failed to transcribe clip ${clip.index}:`, errMsg);
                clip.transcriptionStatus = "failed";
                clip.transcriptionError = errMsg;
                clip.speechSegments = [];
                clip.transcript = "";
              }
            })
          );
          const speechClipsCount = clips.filter(c => c.transcriptionStatus === "completed_with_speech").length;
          const failedClipsCount = clips.filter(c => c.transcriptionStatus === "failed").length;
          trace.push({
            stage: "Audio Transcription",
            model: getModel("vision"),
            durationMs: Date.now() - transStart,
            decision: `${speechClipsCount} speech | ${failedClipsCount} unverified (failed) | ${clips.length - speechClipsCount - failedClipsCount} confirmed silent`,
          });
        }

      } else if (toolName === "hook-detection") {
        const result = await hookDetectionTool.execute({
          videoAnalysis: videoAnalysisResult,
          brief: enrichedPrompt,
          platform: plan.platform,
          cluster: plan.cluster,
        }, ctx);
        void saveToolExecution({ runId, toolName, modelUsed: result.modelUsed, durationMs: result.durationMs, success: result.success });
        if (result.success && result.data) hookResult = result.data;
        trace.push({
          stage: "Hook Detection",
          model: result.modelUsed ?? MODELS.HOOK_DETECTOR,
          durationMs: result.durationMs,
          decision: result.data ? `${result.data.recommendedHook.hookType} | score: ${result.data.recommendedHook.engagementScore} | "${result.data.recommendedHook.captionSuggestion}"` : reason,
        });
        toolsExecuted.push(toolName);

      } else if (toolName === "timeline-generator") {
        const generatorPayload = {
          prompt: enrichedPrompt,
          brand,
          aspectRatio,
          overrides,
          clips: hasClips ? clips : undefined,
          hookResult,
          videoAnalysis: videoAnalysisResult,
          clusterConfig: { ...workflow.clusterConfig, clusterId: workflow.cluster },
          pastExamples,
          classification: {
            cluster: plan.cluster,
            mode: plan.mode,
            intent: plan.intent,
            tone: plan.tone,
            platform: plan.platform,
          },
        };

        let result = await timelineGeneratorTool.execute(generatorPayload, ctx);
        void saveToolExecution({ runId, toolName, modelUsed: result.modelUsed, durationMs: result.durationMs, success: result.success, errorMsg: result.error });
        if (!result.success || !result.data) throw new Error(result.error ?? "Timeline generation failed");

        timeline = result.data.timeline;
        suggestions = result.data.suggestions;
        clipAssignments = result.data.clipAssignments;

        if (timeline.scenes) {
          let validation = validateAndRepairTimeline(
            timeline,
            hasClips ? clips : [],
            clipAssignments
          );

          // If invalid in editorial mode, retry once with explicit corrective feedback
          if (!validation.valid && hasClips) {
            console.warn("[pipeline] Initial timeline invalid, retrying with error context:", validation.errors);
            const retryPayload = {
              ...generatorPayload,
              prompt: `${enrichedPrompt}\n\nIMPORTANT CORRECTION: The previous timeline generation had structural errors: ${validation.errors.join("; ")}. Please return a strictly valid timeline matching the schema and valid clip durations.`,
            };
            const retryResult = await timelineGeneratorTool.execute(retryPayload, ctx);
            if (retryResult.success && retryResult.data) {
              const retryValidation = validateAndRepairTimeline(
                retryResult.data.timeline,
                clips,
                retryResult.data.clipAssignments
              );
              if (retryValidation.valid) {
                result = retryResult;
                validation = retryValidation;
              }
            }
          }

          if (!validation.valid) {
            throw new Error(`Timeline validation failed: ${validation.errors.join("; ")}`);
          }

          if (!result.data) throw new Error("Missing result data after timeline generation.");

          timeline = validation.timeline;
          clipAssignments = validation.clipAssignments;
          suggestions = result.data.suggestions;
          capturedTimestampViolations = validation.timestampViolations;

          if (capturedTimestampViolations.length > 0) {
            trace.push({
              stage: "Timestamp Auditor",
              model: "pipeline-guards",
              durationMs: 0,
              decision: `${capturedTimestampViolations.length} invalid timestamp(s) caught & clamped: ${capturedTimestampViolations.map(v => v.details).join("; ").slice(0, 100)}`,
            });
          }
        }

        trace.push({
          stage: "Timeline Generator",
          model: result.modelUsed ?? (hasClips ? MODELS.EDITORIAL_ANALYZER : MODELS.CONCEPT_GENERATOR),
          durationMs: result.durationMs,
          decision: result.data ? `${timeline.scenes?.length ?? 0} scenes | ${timeline.totalDuration}s | ${result.data.generationNotes}` : "Timeline Generator failed",
        });
        toolsExecuted.push(toolName);

      }
      // transition-planner, caption-generator, music-selector are handled below in parallel

    } catch (toolError) {
      const errMsg = toolError instanceof Error ? toolError.message : String(toolError);
      void saveToolExecution({ runId, toolName, durationMs: Date.now() - t0, success: false, errorMsg: errMsg });
      if (toolName === "timeline-generator") throw toolError;
      trace.push({ stage: `${toolName} (failed)`, model: "—", durationMs: Date.now() - t0, decision: errMsg.slice(0, 80) });
    }
  }

  if (!timeline) throw new Error("timeline-generator was not reached or failed");

  // ── Step 3b: Post-timeline polish tools — run in parallel ──────────────────
  // transition-planner, caption-generator, music-selector all read from
  // timeline but don't depend on each other, so they can run concurrently.
  const POST_TIMELINE = ["transition-planner", "caption-generator", "music-selector"] as const;
  const postTools = plan.tools.filter(t => POST_TIMELINE.includes(t.toolName as typeof POST_TIMELINE[number]));

  if (postTools.length > 0) {
    const parallelStart = Date.now();
    const sceneEnergies = (timeline.scenes ?? []).map(s => `${s.label}(${s.mood ?? "neutral"})`).join(", ");

    const postResults = await Promise.allSettled(postTools.map(async ({ toolName }) => {
      const t = Date.now();
      if (toolName === "transition-planner") {
        return { toolName, result: await transitionPlannerTool.execute({
          timeline: timeline!,
          clusterPacingStyle: workflow.clusterConfig.pacingStyle,
          platform: plan.platform, tone: plan.tone, originalPrompt: enrichedPrompt,
        }, ctx), durationMs: Date.now() - t };
      }
      if (toolName === "caption-generator") {
        const isMinimalRequested = prompt.toLowerCase().includes("minimal") || activeRefProfile?.captionTypography?.toLowerCase().includes("minimal") || activeRefProfile?.captionPlacement?.toLowerCase().includes("minimal");
        const targetCaptionStyle = isMinimalRequested
          ? "minimal"
          : (template?.captionStyle ?? workflow.clusterConfig.captionStyle);
        return { toolName, result: await captionGeneratorTool.execute({
          timeline: timeline!,
          captionStyle: targetCaptionStyle,
          maxCharsPerLine: brand.captionStyle.maxCharsPerLine,
          platform: plan.platform, tone: activeRefProfile?.visualMood ?? plan.tone, brandName: brand.name, originalPrompt: enrichedPrompt,
        }, ctx), durationMs: Date.now() - t };
      }
      if (toolName === "music-selector") {
        const refEnergy = activeRefProfile?.musicEnergy ? `[Reference Music Energy: ${activeRefProfile.musicEnergy}]` : "";
        return { toolName, result: await musicSelectorTool.execute({
          cluster: plan.cluster,
          tone: activeRefProfile?.visualMood ?? plan.tone,
          platform: plan.platform,
          targetDuration: timeline!.totalDuration ?? 30,
          sceneCount: timeline!.scenes?.length ?? 0,
          energyProfile: `${sceneEnergies} ${refEnergy}`.trim(),
          brandName: brand.name,
        }, ctx), durationMs: Date.now() - t };
      }
      return null;
    }));

    for (const settled of postResults) {
      if (settled.status === "rejected") continue;
      const payload = settled.value;
      if (!payload) continue;
      const { toolName, result, durationMs } = payload;

      void saveToolExecution({ runId, toolName, modelUsed: result.modelUsed, durationMs, success: result.success });
      toolsExecuted.push(toolName);

      if (toolName === "transition-planner") {
        const data = result.data as Awaited<ReturnType<typeof transitionPlannerTool.execute>>["data"];
        if (result.success && Array.isArray(data?.transitions) && timeline.scenes) {
          for (const t of data!.transitions) {
            const scene = timeline.scenes.find(s => s.id === t.sceneId);
            if (scene) scene.transition = { type: t.transitionType as "cut" | "fade" | "dissolve" | "cinematic-fade", duration: t.duration };
          }
        }
        trace.push({
          stage: "Transition Planner", model: result.modelUsed ?? MODELS.TRANSITION_PLANNER, durationMs,
          decision: data ? `flow score: ${data.overallFlowScore} | ${data.pacingNotes.slice(0, 60)}` : "original transitions kept",
        });
      } else if (toolName === "caption-generator") {
        const data = result.data as Awaited<ReturnType<typeof captionGeneratorTool.execute>>["data"];
        if (result.success && Array.isArray(data?.scenes) && timeline.scenes) {
          for (const sceneCaps of data!.scenes) {
            const scene = timeline.scenes.find(s => s.id === sceneCaps.sceneId);
            if (scene && Array.isArray(sceneCaps.captions) && sceneCaps.captions.length > 0) {
              scene.captions = sceneCaps.captions.map(c => ({
                ...c,
                style: (["brand-default", "highlight", "subtle", "bold"].includes(c.style ?? "") ? c.style : "brand-default") as "brand-default" | "highlight" | "subtle" | "bold" | undefined,
              }));
            }
          }
        }
        trace.push({
          stage: "Caption Generator", model: result.modelUsed ?? MODELS.CAPTION_GENERATOR, durationMs,
          decision: data ? data.captionNotes.slice(0, 80) : "original captions kept",
        });
      } else if (toolName === "music-selector") {
        const data = result.data as Awaited<ReturnType<typeof musicSelectorTool.execute>>["data"];
        if (result.success && data && data.primary) {
          musicSpec = { genre: data.primary.genre, searchKeywords: data.primary.searchKeywords || [], editorialNote: data.primary.editorialNote };

          // Automatically select best track from library based on genre/keywords/tempo
          if (timeline) {
            if (!timeline.audioLayers) timeline.audioLayers = [];
            if (timeline.audioLayers.length === 0) {
              let bestTrack = MUSIC_LIBRARY[0];
              let bestScore = -1;
              const targetGenre = (data.primary.genre || "").toLowerCase();
              const targetTempo = data.primary.tempo || "medium";
              
              const targetEnergy = activeRefProfile?.musicEnergy ?? (template?.musicEnergy ?? "medium");

              for (const track of MUSIC_LIBRARY) {
                let score = 0;
                const cat = track.category.toLowerCase();
                if (targetGenre && (targetGenre.includes(cat) || cat.includes(targetGenre))) score += 5;
                if (data.primary.mood && track.mood.toLowerCase() === data.primary.mood.toLowerCase()) score += 3;
                if (Array.isArray(data.primary.searchKeywords) && data.primary.searchKeywords.some(kw => track.tags.includes(kw.toLowerCase()))) score += 2;
                
                if (targetTempo.includes("fast") && track.bpm > 120) score += 2;
                if (targetTempo.includes("slow") && track.bpm < 85) score += 3;
                if (targetTempo.includes("medium") && track.bpm >= 80 && track.bpm <= 120) score += 2;

                if (targetEnergy === "low" && track.bpm < 85) score += 4;
                if (targetEnergy === "high" && track.bpm > 115) score += 4;
                if (targetEnergy === "medium" && track.bpm >= 85 && track.bpm <= 115) score += 4;

                if (score > bestScore) {
                  bestScore = score;
                  bestTrack = track;
                }
              }

              if (bestTrack) {
                timeline.audioLayers = [{
                  id: `audio-${bestTrack.id}`,
                  type: "bgm",
                  src: bestTrack.previewUrl,
                  startTime: 0,
                  endTime: timeline.totalDuration ?? 30,
                  volume: template?.musicVolume ?? 0.7,
                  fadeIn: template ? 1.0 : 0.5,
                  fadeOut: template ? 2.0 : 1.0,
                }];
                console.log(`[pipeline] Auto-selected music: ${bestTrack.title} (Score: ${bestScore})`);
              }
            }
          }
        }
        trace.push({
          stage: "Music Selector", model: result.modelUsed ?? MODELS.MUSIC_SELECTOR, durationMs,
          decision: data?.primary ? `${data.primary.genre} | ${data.primary.tempo} | ${data.primary.searchKeywords?.[0] ?? ""}` : "no spec",
        });
      }
    }
    console.log(`[pipeline] post-timeline parallel block: ${Date.now() - parallelStart}ms for ${postTools.length} tools`);
  }

  // ── Apply Reference & User Customization to Scenes (Color Treatment, Pacing, Captions) ──
  if (timeline && timeline.scenes) {
    // 1. Color treatment (warmer lighting)
    const isWarmRequested = prompt.toLowerCase().includes("warm") || (activeRefProfile?.lightingStyle?.toLowerCase().includes("warm") ?? false) || (activeRefProfile?.visualMood?.toLowerCase().includes("warm") ?? false);
    if (isWarmRequested) {
      timeline.scenes.forEach(s => {
        if (!s.colorGrade || s.colorGrade === "Cinematic Grade" || s.colorGrade === "Natural") {
          s.colorGrade = "Warm Glow";
        }
      });
    }

    // 2. Slower pacing requested
    const isSlowRequested = prompt.toLowerCase().includes("slower") || prompt.toLowerCase().includes("slow") || activeRefProfile?.pacingPreference === "cinematic-slow";
    if (isSlowRequested) {
      timeline.scenes.forEach(s => {
        if (s.duration < 3.0) s.duration = 3.5;
      });
      timeline.totalDuration = Number(timeline.scenes.reduce((acc, s) => acc + s.duration, 0).toFixed(2));
    }

    // 3. Minimal captions requested
    const isMinimalCaps = prompt.toLowerCase().includes("minimal") || activeRefProfile?.captionTypography?.toLowerCase().includes("minimal") || activeRefProfile?.captionPlacement?.toLowerCase().includes("minimal");
    if (isMinimalCaps) {
      timeline.scenes.forEach(s => {
        if (s.captions) {
          s.captions = s.captions.map(c => ({
            ...c,
            fontSize: Math.min(c.fontSize || 18, 18),
            y: 86,
          }));
        }
      });
    }
  }

  // ── Step 4: Evaluate ────────────────────────────────────────────────────────
  const evalStart = Date.now();
  const evalResult = await runEvaluator({
    timeline,
    brand,
    workflow,
    originalPrompt: enrichedPrompt,
    timestampViolations: capturedTimestampViolations,
  });
  trace.push({
    stage: "Evaluator",
    model: evalResult.evalModel,
    durationMs: Date.now() - evalStart,
    decision: `score: ${evalResult.overallScore}/100 | ${evalResult.passedQA ? "PASSED" : "FAILED"} | ${evalResult.issues.length} issue(s)${capturedTimestampViolations.length > 0 ? ` (${capturedTimestampViolations.length} timestamp violations)` : ""}`,
  });

  // ── Step 4: Persist ─────────────────────────────────────────────────────────
  let dbSaved = false;
  try {
    const totalMs = Date.now() - pipelineStart;

    await saveGeneration({
      workspaceSlug, runId, prompt,
      cluster: plan.cluster,
      workflowId: workflow.id,
      aspectRatio,
      timeline, trace,
      evalScore: evalResult.overallScore,
    });

    await saveWorkflowRun({
      runId, workspaceSlug,
      workflowId: workflow.id,
      cluster: plan.cluster,
      mode: plan.mode,
      prompt,
      toolsExecuted,
      totalMs,
      evalScore: evalResult.overallScore,
      passedQA: evalResult.passedQA,
    });

    await saveEvaluationResult({
      runId, workspaceSlug,
      workflowId: workflow.id,
      overallScore: evalResult.overallScore,
      passedQA: evalResult.passedQA,
      criteria: evalResult.criteriaScores,
      issues: evalResult.issues,
      improvements: evalResult.improvements,
      evalModel: evalResult.evalModel,
    });

    dbSaved = true;
  } catch { /* non-fatal */ }

  return {
    cluster: plan.cluster,
    mode: plan.mode,
    workflowId: workflow.id,
    trace,
    timeline,
    suggestions,
    clipAssignments: clipAssignments.length ? clipAssignments : undefined,
    evaluation: {
      overallScore: evalResult.overallScore,
      passedQA: evalResult.passedQA,
      improvements: evalResult.improvements,
      issues: evalResult.issues,
      compliments: evalResult.compliments,
      timestampViolations: evalResult.timestampViolations,
      criteriaScores: evalResult.criteriaScores.map(s => ({
        criterion: s.criterion,
        score: s.score,
        rating: s.rating,
        notes: s.notes,
      })),
      platformScores: evalResult.platformScores.map(s => ({
        platform: s.platform,
        score: s.score,
        rating: s.rating,
        insight: s.insight,
      })),
    },
    musicSpec,
    referenceProfile: activeRefProfile,
    dbSaved,
  };
}
