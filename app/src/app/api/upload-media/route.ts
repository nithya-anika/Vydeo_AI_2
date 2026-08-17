import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: "Filename and contentType required" }, { status: 400 });
    }

    const path = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    // 1. AWS S3 INTEGRATION
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsRegion = process.env.AWS_REGION || "eu-north-1";
    const awsBucket = process.env.S3_BUCKET_NAME;

    if (awsAccessKey && awsSecretKey && awsBucket) {
      const s3Client = new S3Client({
        region: awsRegion, 
        credentials: {
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        },
      });

      const command = new PutObjectCommand({
        Bucket: awsBucket,
        Key: path,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      const getCommand = new GetObjectCommand({
        Bucket: awsBucket,
        Key: path,
      });
      // We generate a standard S3 Presigned GET URL valid for 24 hours so rendering APIs can download it securely.
      const publicUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 86400 });

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
