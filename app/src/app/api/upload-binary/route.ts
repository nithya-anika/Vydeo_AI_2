import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;
    const ext = formData.get("ext") as string || "mp4";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const tmpDir = "/var/tmp/ai-video-uploads";
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true });
    }

    const filename = `${uuidv4()}.${ext}`;
    const filepath = path.join(tmpDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    return NextResponse.json({
      success: true,
      filepath,
    });
  } catch (error: any) {
    console.error("[upload-binary] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
