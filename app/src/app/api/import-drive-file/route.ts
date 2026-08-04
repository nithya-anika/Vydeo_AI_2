import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";

export const maxDuration = 60; // Give it up to 60 seconds per single file download/upload

export async function POST(req: NextRequest) {
  try {
    const { fileId, filename, mimeType } = await req.json();
    if (!fileId || !filename || !mimeType) {
      return NextResponse.json({ error: "fileId, filename, and mimeType are required" }, { status: 400 });
    }

    const storjAccessKey = process.env.STORJ_ACCESS_KEY;
    const storjSecretKey = process.env.STORJ_SECRET_KEY;
    const storjEndpoint = process.env.STORJ_ENDPOINT;
    const storjBucket = process.env.STORJ_BUCKET || "vydeoai";

    if (!storjAccessKey || !storjSecretKey || !storjEndpoint) {
      return NextResponse.json({ error: "Storj S3 Storage is not configured." }, { status: 500 });
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

    // Upload to Storj S3 Storage
    const pathSuffix = `uploads/drive-${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    
    const s3Client = new S3Client({
      region: "us-east-1", 
      endpoint: storjEndpoint,
      credentials: {
        accessKeyId: storjAccessKey,
        secretAccessKey: storjSecretKey,
      },
      forcePathStyle: true,
    });

    const command = new PutObjectCommand({
      Bucket: storjBucket,
      Key: pathSuffix,
      ContentType: mimeType,
    });

    // Generate a presigned URL valid for 1 hour to pipe to
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Pipe the Google Drive ReadableStream directly to Storj S3 Storage!
    // This consumes 0MB of server RAM and easily supports multi-gigabyte transfers.
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
      },
      body: downloadRes.body,
      duplex: "half",
    } as any);

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload ${filename} to Storj S3 Storage: ${errText}`);
    }

    // Storj uses a special gateway for public file access.
    // Use the STORJ_SHARED_KEY if provided, otherwise fallback to the access key (which may be blocked if not a shared key).
    const publicAccessKey = process.env.STORJ_SHARED_KEY || storjAccessKey;
    const publicUrl = `https://link.storjshare.io/raw/${publicAccessKey}/${storjBucket}/${pathSuffix}`;
    
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
