import { NextRequest, NextResponse } from "next/server";
import { analyzeReferences } from "@/lib/reference-analysis";
import type { ReferenceMedia } from "@/types/references";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { references, templateName, customPrompt } = await req.json() as {
      references?: ReferenceMedia[];
      templateName?: string;
      customPrompt?: string;
    };

    if (!Array.isArray(references) || references.length === 0) {
      return NextResponse.json({ error: "No reference media provided" }, { status: 400 });
    }

    // Validate size and count
    if (references.length > 8) {
      return NextResponse.json({ error: "Maximum 8 reference files allowed" }, { status: 400 });
    }

    const profile = await analyzeReferences(references, templateName, customPrompt);
    return NextResponse.json({ success: true, profile });
  } catch (err: any) {
    console.error("[api/analyze-references] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to analyze references" }, { status: 500 });
  }
}
