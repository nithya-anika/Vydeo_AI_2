import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: "Filename and contentType required" }, { status: 400 });
    }

    const path = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    // 1. STORJ S3 INTEGRATION
    const storjAccessKey = process.env.STORJ_ACCESS_KEY;
    const storjSecretKey = process.env.STORJ_SECRET_KEY;
    const storjEndpoint = process.env.STORJ_ENDPOINT;
    const storjBucket = process.env.STORJ_BUCKET || "vydeoai";

    if (storjAccessKey && storjSecretKey && storjEndpoint) {
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
        Key: path,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      // Storj uses a special gateway for public file access.
      // Format: https://link.storjshare.io/raw/<ACCESS_KEY>/<BUCKET>/<PATH>
      const publicUrl = `https://link.storjshare.io/raw/${storjAccessKey}/${storjBucket}/${path}`;

      return NextResponse.json({
        success: true,
        url: uploadUrl,
        isS3: true,
        publicUrl,
      });
    }

    // 2. GOOGLE CLOUD STORAGE FALLBACK
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: "No cloud storage configured (Storj or GCS)" }, { status: 400 });
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
    const gcsPath = path;
    
    return NextResponse.json({
      success: true,
      url: `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(gcsPath)}`,
      gcsPath,
      token,
      isS3: false,
    });
  } catch (err: any) {
    console.error("[Upload] Error generating URL:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
