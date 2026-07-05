import { NextRequest, NextResponse } from "next/server";
import { runAgentPipeline } from "@/lib/agent-pipeline";
import type { GeminiClip, BrandOverrides } from "@/lib/gemini";
import { getWorkspace } from "@/lib/workspaces/asaya";
import { BrandWorkspaceSchema } from "@/types/brand";
import { demoLineup } from "@/lib/demo-lineup";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requestStart = Date.now();

  try {
    console.time("[lineup] total-request");

    const body = await req.json();

    const {
      prompt,
      workspaceSlug,
      runQA = false,
      aspectRatio,
      geminiClips,
      brandOverrides,
      existingTimeline,
      duration,
      workflow,
      platform,
      stylePreset,
    } = body;

    const isRefinement = Boolean(existingTimeline);
    const hasClips =
      Array.isArray(geminiClips) && geminiClips.length > 0;

    //------------------------------------
    // Validation
    //------------------------------------

    if (
      !prompt ||
      typeof prompt !== "string" ||
      (!isRefinement && prompt.trim().length < 10)
    ) {
      return NextResponse.json(
        { error: "Prompt must be at least 10 characters." },
        { status: 400 }
      );
    }

    if (!workspaceSlug || typeof workspaceSlug !== "string") {
      return NextResponse.json(
        { error: "workspaceSlug is required." },
        { status: 400 }
      );
    }

    //------------------------------------
    // Workspace
    //------------------------------------

    const workspace = getWorkspace(workspaceSlug);

    if (!workspace) {
      return NextResponse.json(
        {
          error: `No workspace found for slug: ${workspaceSlug}`,
        },
        { status: 404 }
      );
    }

    const parsedWorkspace = BrandWorkspaceSchema.safeParse(workspace);

    if (!parsedWorkspace.success) {
      return NextResponse.json(
        {
          error: "Brand workspace config is invalid.",
        },
        { status: 500 }
      );
    }

    //------------------------------------
    // Prompt Controls
    //------------------------------------

    const directives: string[] = [];

    if (platform?.trim())
      directives.push(`Target platform: ${platform.trim()}.`);

    if (duration)
      directives.push(`Target total duration: ${duration}s.`);

    if (stylePreset?.trim())
      directives.push(`Visual style: ${stylePreset.trim()}.`);

    if (workflow?.trim())
      directives.push(`Workflow: ${workflow.trim()}.`);

    const controlDirective =
      directives.length > 0
        ? directives.join(" ") + "\n\n"
        : "";

    //------------------------------------
    // Clips
    //------------------------------------

    const clips: GeminiClip[] = hasClips
      ? (geminiClips as GeminiClip[]).map((clip, index) => ({
          ...clip,
          index,
        }))
      : [];

    //------------------------------------
    // Final Prompt
    //------------------------------------

    const refinedPrompt = isRefinement
      ? `
REFINEMENT REQUEST

Modify the existing timeline below.

Rules:
- Preserve scene IDs.
- Preserve style.
- Preserve mood.
- Preserve structure.
- Only change what the user requested.

EXISTING TIMELINE

${JSON.stringify(existingTimeline, null, 2)}

${controlDirective}

USER REQUEST

${prompt.trim()}
`
      : `${controlDirective}${prompt.trim()}`;

    //------------------------------------
    // Run Pipeline
    //------------------------------------

    console.time("[pipeline]");

    const result = await runAgentPipeline({
      prompt: refinedPrompt,
      brand: workspace,
      clips,
      aspectRatio,
      overrides: brandOverrides as BrandOverrides | undefined,
      workspaceSlug,
      runQA,
    });

    console.timeEnd("[pipeline]");

    //------------------------------------
    // Empty Response Fallback
    //------------------------------------

    if (!result.timeline?.scenes?.length) {
      console.warn("[pipeline] Empty timeline received.");

      return demoResponse(
        prompt,
        workspace,
        "Gemini returned an empty scene list."
      );
    }

    console.timeEnd("[lineup] total-request");

    console.log(
      `[lineup] completed in ${
        Date.now() - requestStart
      } ms`
    );

    //------------------------------------
    // Success
    //------------------------------------

    return NextResponse.json({
      success: true,
      lineup: {
        timeline: result.timeline,
        suggestions: result.suggestions,
      },
      clipAssignments: result.clipAssignments ?? [],
      cluster: result.cluster,
      mode: result.mode,
      workflowId: result.workflowId,
      trace: result.trace,
      evaluation: result.evaluation,
      musicSpec: result.musicSpec,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
    });
  } catch (error) {
    console.error("[lineup]", error);

    return NextResponse.json(
      {
        error: "Failed to generate lineup.",
        message:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}

function demoResponse(
  prompt: string,
  workspace: ReturnType<typeof getWorkspace>,
  demoReason: string
) {
  const demo = structuredClone(demoLineup);

  demo.timeline.meta!.promptUsed = prompt.trim();
  demo.timeline.updatedAt = new Date().toISOString();

  return NextResponse.json({
    success: true,
    lineup: demo,
    clipAssignments: [],
    cluster: "ugc-ads",
    mode: "concept",
    workflowId: "ugc-ads-standard",
    trace: [],
    evaluation: null,
    musicSpec: null,
    workspace: {
      id: workspace!.id,
      name: workspace!.name,
      slug: workspace!.slug,
    },
    demo: true,
    demoReason,
  });
}