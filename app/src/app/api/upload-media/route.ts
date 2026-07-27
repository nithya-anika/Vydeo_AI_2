import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: "Filename and contentType required" }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseBucket = process.env.SUPABASE_BUCKET || "assets";

    if (supabaseUrl && supabaseKey) {
      const cleanUrl = supabaseUrl.replace(/\/$/, "");
      const path = `uploads/${Date.now()}-${filename}`;
      
      const signRes = await fetch(
        `${cleanUrl}/storage/v1/object/upload/sign/${supabaseBucket}/${path}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expiresIn: 300 }),
        }
      );

      if (!signRes.ok) {
        throw new Error(`Supabase sign upload URL failed (${signRes.status}): ${await signRes.text()}`);
      }

      const signData = await signRes.json();
      let relativeUrl = signData.url;
      if (relativeUrl && !relativeUrl.startsWith("/storage/v1")) {
        relativeUrl = `/storage/v1${relativeUrl}`;
      }
      const uploadUrl = `${cleanUrl}${relativeUrl}`;
      const publicUrl = `${cleanUrl}/storage/v1/object/public/${supabaseBucket}/${path}`;

      return NextResponse.json({
        success: true,
        url: uploadUrl,
        isSupabase: true,
        publicUrl,
      });
    }

    // Google Cloud Storage fallback
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: "Neither GCS_BUCKET nor SUPABASE_URL are configured" }, { status: 400 });
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
    const gcsPath = `uploads/${Date.now()}-${filename}`;
    
    return NextResponse.json({
      success: true,
      url: `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(gcsPath)}`,
      gcsPath,
      token,
      isSupabase: false,
    });
  } catch (err: any) {
    console.error("[Upload] Error generating URL:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
