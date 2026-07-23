import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

// Only for GCS cloud transcoder environment
export async function POST(req: NextRequest) {
  try {
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: "GCS_BUCKET not configured" }, { status: 400 });
    }

    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: "Filename and contentType required" }, { status: 400 });
    }

    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      projectId: process.env.GOOGLE_PROJECT_ID,
    });
    
    const token = await auth.getAccessToken();

    // Use the JSON API to generate a signed URL (simulated via strict headers on standard upload)
    const gcsPath = `uploads/${Date.now()}-${filename}`;
    
    return NextResponse.json({
      success: true,
      url: `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(gcsPath)}`,
      gcsPath,
      token
    });
  } catch (err: any) {
    console.error("[Upload] Error generating URL:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
