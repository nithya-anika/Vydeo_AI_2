import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import path from "path";

export const maxDuration = 60; // Give it up to 60 seconds per single file download/upload

export async function POST(req: NextRequest) {
  try {
    const { fileId, filename, mimeType } = await req.json();
    if (!fileId || !filename || !mimeType) {
      return NextResponse.json({ error: "fileId, filename, and mimeType are required" }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const rawBucket = process.env.SUPABASE_BUCKET || "vydeoai2";
    const supabaseBucket = rawBucket === "vydeoai" ? "vydeoai2" : rawBucket;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase Storage is not configured." }, { status: 500 });
    }

    // Google Drive Authentication
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
    let accessToken: string | null = null;

    if (!apiKey) {
      let authOptions: any;
      if (serviceAccountJson) {
        try {
          const credentials = JSON.parse(serviceAccountJson);
          authOptions = {
            credentials,
            scopes: ["https://www.googleapis.com/auth/drive.readonly"],
          };
        } catch (parseErr: any) {
          console.error("[Drive Auth] Failed to parse GOOGLE_SERVICE_ACCOUNT env var:", parseErr);
          return NextResponse.json({ error: `Invalid GOOGLE_SERVICE_ACCOUNT environment variable: ${parseErr.message}` }, { status: 500 });
        }
      } else {
        authOptions = {
          keyFilename: path.join(process.cwd(), "config/service-account.json"),
          scopes: ["https://www.googleapis.com/auth/drive.readonly"],
        };
      }

      try {
        const auth = new GoogleAuth(authOptions);
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        accessToken = tokenResponse.token ?? null;
      } catch (authErr: any) {
        console.warn("[Drive Auth] Service account authentication failed:", authErr.message);
      }
    }

    if (!apiKey && !accessToken) {
      throw new Error("Neither GOOGLE_DRIVE_API_KEY nor a valid GOOGLE_SERVICE_ACCOUNT is configured.");
    }

    console.log(`[Drive File] Importing single file ${filename} (${mimeType})...`);
    
    // Fetch file media bytes from Google Drive
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const downloadHeaders: HeadersInit = {};

    if (apiKey) {
      downloadUrl += `&key=${apiKey}`;
    } else if (accessToken) {
      downloadHeaders["Authorization"] = `Bearer ${accessToken}`;
    }

    const downloadRes = await fetch(downloadUrl, { headers: downloadHeaders });

    if (!downloadRes.ok) {
      throw new Error(`Failed to download ${filename} from Google Drive: ${downloadRes.statusText}`);
    }

    const buffer = await downloadRes.arrayBuffer();

    // Upload to Supabase Storage
    const cleanUrl = supabaseUrl.replace(/\/$/, "");
    const pathSuffix = `uploads/drive-${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const uploadUrl = `${cleanUrl}/storage/v1/object/${supabaseBucket}/${pathSuffix}`;

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": mimeType,
      },
      body: Buffer.from(buffer),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload ${filename} to Supabase Storage: ${errText}`);
    }

    const publicUrl = `${cleanUrl}/storage/v1/object/public/${supabaseBucket}/${pathSuffix}`;
    
    return NextResponse.json({
      success: true,
      clip: {
        id: crypto.randomUUID(),
        name: filename,
        src: publicUrl,
        type: mimeType.startsWith("video/") ? "video" : "image",
        duration: mimeType.startsWith("video/") ? 5 : 4,
      },
    });
  } catch (err: any) {
    console.error("[Drive File] Error during single file import:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
