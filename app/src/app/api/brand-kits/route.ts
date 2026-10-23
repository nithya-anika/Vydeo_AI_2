import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "@/lib/session";
import { brandKitQueries } from "@/lib/user-db";

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const kits = await brandKitQueries.list(session.userId);
    return NextResponse.json({ kits });
  } catch (err: any) {
    console.error("[BrandKits GET] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const body = await req.json();
    const { action, kit, activeId } = body;

    if (action === "saveAll") {
      // Upsert all kits (replace this logic if performance becomes an issue)
      const kitsToSave = Array.isArray(body.kits) ? body.kits : [];
      for (const k of kitsToSave) {
        await brandKitQueries.upsert({
          id: k.id || uuidv4(),
          user_id: session.userId,
          name: k.name || "Unnamed Kit",
          logo: k.logo || null,
          primary_color: k.primary || k.primaryColor || "#FFFFFF",
          secondary_color: k.secondary || k.secondaryColor || "#000000",
          accent_color: k.accent || k.accentColor || "#0066FF",
          font_heading: k.fontHeading || "Inter",
          font_body: k.fontBody || "Inter",
          caption_preset: k.captionPreset || "minimal",
          logo_overlay: k.logoOverlay ? JSON.stringify(k.logoOverlay) : null,
        });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[BrandKits POST] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
