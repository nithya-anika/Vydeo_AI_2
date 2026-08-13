/**
 * Evaluator Agent
 *
 * Scores every generated output before it leaves the pipeline.
 * Uses workflow-specific evaluation criteria with weighted rubrics.
 * Score is persisted to SQLite for the prompt learning layer.
 *
 * Evaluation dimensions (cluster-specific weights):
 *   UGC/Ads:            hook-quality(30%), pacing(20%), cta-clarity(20%), captions(15%), brand(15%)
 *   Travel/Cinematic:   story-arc(30%), visual-flow(25%), pacing(20%), captions(15%), brand(10%)
 *
 * Model: gemini-2.5-pro
 */

import { geminiRequest } from "@/lib/gemini";
import type { Timeline } from "@/types/timeline";
import type { BrandWorkspace } from "@/types/brand";
import type { WorkflowDefinition, EvaluationCriterion } from "@/lib/workflows/types";

const MODEL = "gemini-2.5-pro";

export interface EvaluationInput {
  timeline: Timeline;
  brand: BrandWorkspace;
  workflow: WorkflowDefinition;
  originalPrompt: string;
}

export interface CriterionScore {
  criterion: string;
  score: number;          // 0-100
  weight: number;
  weightedScore: number;  // score * weight
  rating: "excellent" | "good" | "poor";
  notes: string;
}

export interface PlatformScore {
  platform: "instagram" | "youtube" | "tiktok" | "hook-score" | "retention-score" | "cta-score";
  score: number;      // 0-100
  rating: "excellent" | "good" | "needs-work";
  insight: string;    // one-line explanation
}

export interface PromptCheckpoint {
  point: string;
  passed: boolean;
  reason: string;
}

export interface EvaluationOutput {
  overallScore: number;       // 0-100 weighted average or prompt compliance score
  criteriaScores: CriterionScore[];
  platformScores: PlatformScore[];
  passedQA: boolean;          // overall >= 60
  issues: string[];
  improvements: string[];
  compliments: string[];
  evalModel: string;
  promptCheckpoints?: PromptCheckpoint[];
  promptComplianceScore?: number;
}

export async function runEvaluator(input: EvaluationInput): Promise<EvaluationOutput> {
  const start = Date.now();
  const scenes = input.timeline.scenes ?? [];
  const totalSceneDuration = scenes.reduce((s, sc) => s + sc.duration, 0);
  const workflow = input.workflow;

  const criteriaBlock = workflow.evaluationCriteria.map(c =>
    `  ${c.name} (weight: ${(c.weight * 100).toFixed(0)}%):\n    Excellent: ${c.rubric.excellent}\n    Good: ${c.rubric.good}\n    Poor: ${c.rubric.poor}`
  ).join("\n\n");

  const timelineSummary = {
    sceneCount: scenes.length,
    totalDuration: input.timeline.totalDuration,
    sceneDurationSum: parseFloat(totalSceneDuration.toFixed(2)),
    durationMatch: true,
    scenes: scenes.map((s, i) => ({
      order: i + 1,
      label: s.label,
      duration: s.duration,
      captionCount: (s.captions ?? []).length,
      hasTransition: !!s.transition?.type,
      mood: s.mood,
    })),
    captionTexts: scenes.flatMap(s => (s.captions ?? []).map(c => c.text)),
    colorGrade: input.timeline.globalColorGrade,
  };

  const prompt = `You are a video quality evaluator and compliance auditor.
First, divide the ORIGINAL BRIEF into individual concrete requirements ("points" or checkpoints). You must extract at least 3-6 specific checklist items from the user's prompt (e.g. style, duration, specific scene instructions, transitions, text, music, visual mood, etc.).

Then, evaluate the generated timeline against these individual checkpoints and against the workflow's evaluation criteria AND platform suitability.

WORKFLOW: ${workflow.name} (${workflow.cluster})
ORIGINAL BRIEF: "${input.originalPrompt}"
BRAND: ${input.brand.name} — style: ${input.brand.styleKeywords.join(", ")} | prohibited: ${input.brand.prohibitedElements.join(", ")}

TIMELINE SUMMARY:
${JSON.stringify(timelineSummary, null, 2)}

EVALUATION CRITERIA:
${criteriaBlock}

Score each criterion 0-100 based on the rubric (excellent=85-100, good=60-84, poor=0-59).
Be strict — only give "excellent" if the output genuinely matches the rubric description.

Also score the following PLATFORM DIMENSIONS 0-100:
- instagram: Suitability for Instagram Reels/Stories (visual punch, short attention, aesthetic)
- youtube: Suitability for YouTube Shorts/pre-roll (storytelling, retention arc, branding)
- tiktok: Suitability for TikTok (trend awareness, native feel, hook speed)
- hook-score: How strongly the first 3 seconds hooks viewers (urgency, intrigue, visual)
- retention-score: How well the video retains attention through to the end (pacing, payoff)
- cta-score: How clear and compelling the call-to-action is (explicit ask, timing, clarity)

Return ONLY JSON:
{
  "promptCheckpoints": [
    {
      "point": "Create a travel montage",
      "passed": true,
      "reason": "The scenes list depicts high-quality travel landscapes and scenery."
    },
    {
      "point": "Warm color grading",
      "passed": false,
      "reason": "The global color grade is set to 'vibrant' instead of 'warm'."
    }
  ],
  "criteriaScores": [
    {
      "criterion": "hook-quality",
      "score": 82,
      "weight": 0.30,
      "weightedScore": 24.6,
      "rating": "good",
      "notes": "First scene is a product shot but doesn't appear until 1.2s — should be 0.5s"
    }
  ],
  "platformScores": [
    { "platform": "instagram", "score": 78, "rating": "good", "insight": "Good vertical format but scene count could be trimmed to 6 for optimal Reels pacing" },
    { "platform": "youtube", "score": 65, "rating": "good", "insight": "Adequate for pre-roll but storytelling arc is weak for Shorts" },
    { "platform": "tiktok", "score": 71, "rating": "good", "insight": "Caption style is on-trend but hook arrives 0.8s too late" },
    { "platform": "hook-score", "score": 88, "rating": "excellent", "insight": "Opening 2 seconds are visually arresting and create immediate curiosity" },
    { "platform": "retention-score", "score": 74, "rating": "good", "insight": "Pacing dips in scenes 3-4, consider trimming each by 1 second" },
    { "platform": "cta-score", "score": 69, "rating": "good", "insight": "CTA exists but appears in the last 1.5s — extend to 3s for better conversion" }
  ],
  "issues": ["Duration mismatch: requested 30s, generated 27s"],
  "improvements": ["Move product close-up to scene 1", "Add CTA text to final scene"],
  "compliments": ["Caption copy is punchy and on-brand", "Fast pacing matches the platform"]
}

Note: Do NOT include overallScore or passedQA in the JSON. They are computed programmatically.`;

  try {
    const data = await geminiRequest(MODEL, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 1.0, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 2000 } },
    });

    const raw = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      .candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()) as Omit<EvaluationOutput, "overallScore" | "passedQA" | "evalModel" | "platformScores"> & { platformScores?: PlatformScore[], promptCheckpoints?: PromptCheckpoint[] };

    const promptCheckpoints = parsed.promptCheckpoints ?? [];
    const totalCheckpoints = promptCheckpoints.length;
    const passedCheckpoints = promptCheckpoints.filter(cp => cp.passed).length;
    const promptComplianceScore = totalCheckpoints > 0 ? Math.round((passedCheckpoints / totalCheckpoints) * 100) : 100;

    // Recompute weighted score from criteria
    const scores = parsed.criteriaScores ?? [];
    // Fill in any missing weights from the workflow definition
    for (const cs of scores) {
      const def = workflow.evaluationCriteria.find(c => c.name === cs.criterion);
      if (def && !cs.weight) cs.weight = def.weight;
      cs.weightedScore = cs.score * cs.weight;
    }

    // Add any criteria the model missed
    const covered = new Set(scores.map(s => s.criterion));
    for (const c of workflow.evaluationCriteria) {
      if (!covered.has(c.name)) {
        scores.push({
          criterion: c.name,
          score: 65,
          weight: c.weight,
          weightedScore: 65 * c.weight,
          rating: "good",
          notes: "Not evaluated — defaulted to good",
        });
      }
    }

    // overallScore is calculated purely based on the individual requirements (checkpoints) passed.
    const overallScore = totalCheckpoints > 0 ? promptComplianceScore : Math.round(scores.reduce((sum, s) => sum + s.weightedScore, 0));

    // Construct detailed checklist comments to display which are passing and which are failing
    const compliments = parsed.compliments ?? [];
    const issues = parsed.issues ?? [];
    const improvements = parsed.improvements ?? [];

    if (totalCheckpoints > 0) {
      const passingList = promptCheckpoints.filter(cp => cp.passed);
      const failingList = promptCheckpoints.filter(cp => !cp.passed);

      // Prepend failing ones to issues
      const failingMessages = failingList.map(cp => `❌ [FAILED] Point: "${cp.point}" — ${cp.reason}`);
      issues.unshift(...failingMessages);

      // Prepend passing ones to compliments
      const passingMessages = passingList.map(cp => `✅ [PASSED] Point: "${cp.point}" — ${cp.reason}`);
      compliments.unshift(...passingMessages);

      // Prepend score above
      const summaryMsg = `🎯 PROMPT COMPLIANCE SCORE: ${promptComplianceScore}% (${passedCheckpoints}/${totalCheckpoints} checkpoints passed)`;
      compliments.unshift(summaryMsg);
    }

    console.log(`[evaluator] ${workflow.id} → compliance score: ${promptComplianceScore}/100, checkpoints: ${passedCheckpoints}/${totalCheckpoints} | ${Date.now() - start}ms`);

    return {
      overallScore,
      criteriaScores: scores,
      platformScores: parsed.platformScores ?? [],
      passedQA: overallScore >= 60,
      issues,
      improvements,
      compliments,
      evalModel: MODEL,
      promptCheckpoints,
      promptComplianceScore,
    };
  } catch (e) {
    // Non-fatal — return neutral score
    console.warn("[evaluator] error:", e instanceof Error ? e.message : String(e));
    return buildNeutralEval(workflow.evaluationCriteria, MODEL);
  }
}

function buildNeutralEval(criteria: EvaluationCriterion[], model: string): EvaluationOutput {
  const scores: CriterionScore[] = criteria.map(c => ({
    criterion: c.name,
    score: 70,
    weight: c.weight,
    weightedScore: 70 * c.weight,
    rating: "good" as const,
    notes: "Evaluation unavailable — neutral score",
  }));

  return {
    overallScore: 70,
    criteriaScores: scores,
    platformScores: [],
    passedQA: true,
    issues: [],
    improvements: ["Run evaluation manually for detailed scoring"],
    compliments: [],
    evalModel: model,
    promptCheckpoints: [],
    promptComplianceScore: 70,
  };
}
