import { NextRequest, NextResponse } from "next/server";
import { S3Client, CompleteMultipartUploadCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
  try {
    const { uploadId, key, parts } = await req.json();
    if (!uploadId || !key || !parts) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsRegion = process.env.AWS_REGION || "eu-north-1";
    const awsBucket = process.env.S3_BUCKET_NAME;

    if (!awsAccessKey || !awsSecretKey || !awsBucket) {
      return NextResponse.json({ error: "S3 not configured" }, { status: 500 });
    }

    const s3Client = new S3Client({
      region: awsRegion,
      credentials: { accessKeyId: awsAccessKey, secretAccessKey: awsSecretKey },
    });

    const command = new CompleteMultipartUploadCommand({
      Bucket: awsBucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p: any) => ({
          ETag: p.eTag,
          PartNumber: p.partNumber,
        })),
      },
    });

    await s3Client.send(command);

    // Generate a long-lived GET URL for rendering
    const getCommand = new GetObjectCommand({
      Bucket: awsBucket,
      Key: key,
    });
    const publicUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 86400 });

    return NextResponse.json({ success: true, publicUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
