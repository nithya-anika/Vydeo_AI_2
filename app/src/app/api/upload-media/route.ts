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
        region: "us-east-1", // S3-compatible endpoints often default to this
        endpoint: storjEndpoint,
        credentials: {
          accessKeyId: storjAccessKey,
          secretAccessKey: storjSecretKey,
        },
        forcePathStyle: true, // Required for many S3 compatible providers like Storj
      });

      const command = new PutObjectCommand({
        Bucket: storjBucket,
        Key: path,
        ContentType: contentType,
      });

      // Generate a presigned URL valid for 1 hour
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      // Storj Public Link format: https://link.storjshare.io/raw/<access_key>/<bucket>/<path>
      // To get a public link, the bucket must be shared, or you can construct it using the gateway.
      // We will construct standard S3 virtual-hosted or path-style public URLs.
      const publicUrl = `${storjEndpoint}/${storjBucket}/${path}`;

      return NextResponse.json({
        success: true,
        url: uploadUrl,
        isS3: true,
        publicUrl,
      });
    }

    // 2. SUPABASE INTEGRATION
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const rawBucket = process.env.SUPABASE_BUCKET || "vydeoai2";
    const supabaseBucket = rawBucket === "vydeoai" ? "vydeoai2" : rawBucket;

    if (supabaseUrl && supabaseKey) {
      const cleanUrl = supabaseUrl.replace(/\/$/, "");
      
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

    // 3. GOOGLE CLOUD STORAGE FALLBACK
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: "No cloud storage configured (Storj, Supabase, or GCS)" }, { status: 400 });
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
      isSupabase: false,
      isS3: false,
    });
  } catch (err: any) {
    console.error("[Upload] Error generating URL:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
