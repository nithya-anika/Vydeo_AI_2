import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { userQueries } from "@/lib/user-db";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { assistantName, assistantNameCustomized } = await req.json();

    if (typeof assistantName !== "string" || !assistantName.trim()) {
      return NextResponse.json({ error: "Name must be a valid non-empty string." }, { status: 400 });
    }

    let normalizedName = assistantName.trim();
    if (normalizedName.length > 24) {
      return NextResponse.json({ error: "Name must be 24 characters or fewer." }, { status: 400 });
    }

    // Filter control characters but allow normal unicode
    normalizedName = normalizedName.replace(/[\x00-\x1F\x7F]/g, "");

    const isCustomized = typeof assistantNameCustomized === "boolean" ? assistantNameCustomized : true;

    await userQueries.updateAssistantPreferences(session.userId, normalizedName, isCustomized);

    return NextResponse.json({ success: true, assistantName: normalizedName, assistantNameCustomized: isCustomized });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update preferences" }, { status: 500 });
  }
}
