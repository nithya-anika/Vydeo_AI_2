import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import path from "path";

export const maxDuration = 60; // Fast metadata-only listing!
// Trigger fresh rebuild on Vercel

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

    // Filter video and image media (Support .mov even if Google returns a generic mimeType)
    const mediaFiles = filesList.filter((f) => {
      const isVideoMime = f.mimeType?.startsWith("video/");
      const isImageMime = f.mimeType?.startsWith("image/");
      const isVideoExt = /\.(mov|mp4|webm|m4v|avi|mkv|mpeg|mpg|3gp|flv)$/i.test(f.name);
      const isImageExt = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(f.name);
      
      return isVideoMime || isImageMime || isVideoExt || isImageExt;
    });

    // Normalize mimeType for known extensions if Google returned a generic one
    const normalizedFiles = mediaFiles.map((f) => {
      let mimeType = f.mimeType;
      if (/\.mov$/i.test(f.name) && !mimeType?.startsWith("video/")) {
        mimeType = "video/quicktime";
      } else if (/\.mp4$/i.test(f.name) && !mimeType?.startsWith("video/")) {
        mimeType = "video/mp4";
      }
      return {
        id: f.id,
        name: f.name,
        mimeType,
        size: f.size,
      };
    });

    return NextResponse.json({
      success: true,
      files: normalizedFiles,
    });
  } catch (err: any) {
    console.error("[Drive] Fatal Error during listing:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
