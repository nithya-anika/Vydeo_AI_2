import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import path from "path";

export const maxDuration = 300; // Give it up to 5 minutes to import large folder trees!

function extractFolderId(url: string): string | null {
  const match = url.match(/folders\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  const queryMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (queryMatch) return queryMatch[1];
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { folderUrl } = await req.json();
    if (!folderUrl) {
      return NextResponse.json({ error: "folderUrl is required" }, { status: 400 });
    }

    const folderId = extractFolderId(folderUrl);
    if (!folderId) {
      return NextResponse.json({ error: "Invalid Google Drive folder URL format." }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const rawBucket = process.env.SUPABASE_BUCKET || "vydeoai2";
    const supabaseBucket = rawBucket === "vydeoai" ? "vydeoai2" : rawBucket;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase Storage is not configured." }, { status: 500 });
    }

    // Google Drive Authentication (supports either GOOGLE_DRIVE_API_KEY or GOOGLE_SERVICE_ACCOUNT)
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
        console.warn("[Drive Auth] Service account authentication failed, trying to continue:", authErr.message);
      }
    }

    if (!apiKey && !accessToken) {
      throw new Error("Neither GOOGLE_DRIVE_API_KEY nor a valid GOOGLE_SERVICE_ACCOUNT is configured.");
    }

    // List files recursively
    const filesList: any[] = [];
    
    async function recurse(id: string) {
      const q = `'${id}' in parents and trashed=false`;
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size)`;
      const headers: HeadersInit = {};

      if (apiKey) {
        url += `&key=${apiKey}`;
      } else if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }
      
      const res = await fetch(url, { headers });
      
      if (!res.ok) {
        throw new Error(`Google Drive API returned HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      const items = data.files ?? [];
      
      for (const item of items) {
        if (item.mimeType === "application/vnd.google-apps.folder") {
          await recurse(item.id);
        } else {
          filesList.push(item);
        }
      }
    }
    
    await recurse(folderId);

    // Filter video and image media
    const mediaFiles = filesList.filter((f) => 
      f.mimeType.startsWith("video/") || 
      f.mimeType.startsWith("image/")
    );

    const importedClips: any[] = [];

    // Download and upload each file in parallel/sequence
    for (const file of mediaFiles) {
      try {
        console.log(`[Drive] Importing ${file.name} (${file.mimeType})...`);
        
        // Fetch file media bytes from Google Drive
        let downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
        const downloadHeaders: HeadersInit = {};

        if (apiKey) {
          downloadUrl += `&key=${apiKey}`;
        } else if (accessToken) {
          downloadHeaders["Authorization"] = `Bearer ${accessToken}`;
        }

        const downloadRes = await fetch(downloadUrl, { headers: downloadHeaders });

        if (!downloadRes.ok) {
          console.warn(`[Drive] Failed to download ${file.name}: ${downloadRes.statusText}`);
          continue;
        }

        const buffer = await downloadRes.arrayBuffer();

        // Upload to Supabase Storage
        const cleanUrl = supabaseUrl.replace(/\/$/, "");
        const pathSuffix = `uploads/drive-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const uploadUrl = `${cleanUrl}/storage/v1/object/${supabaseBucket}/${pathSuffix}`;

        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": file.mimeType,
          },
          body: Buffer.from(buffer),
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          console.warn(`[Drive] Failed to upload ${file.name} to Supabase: ${errText}`);
          continue;
        }

        const publicUrl = `${cleanUrl}/storage/v1/object/public/${supabaseBucket}/${pathSuffix}`;
        
        importedClips.push({
          id: crypto.randomUUID(),
          name: file.name,
          src: publicUrl,
          type: file.mimeType.startsWith("video/") ? "video" : "image",
          duration: file.mimeType.startsWith("video/") ? 5 : 4,
        });
      } catch (err) {
        console.error(`[Drive] Error importing file ${file.name}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: importedClips.length,
      clips: importedClips,
    });
  } catch (err: any) {
    console.error("[Drive] Fatal Error during import:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
