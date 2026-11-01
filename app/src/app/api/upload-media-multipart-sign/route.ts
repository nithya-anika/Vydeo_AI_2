import { NextRequest, NextResponse } from "next/server";
import { S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
  try {
    const { uploadId, key, partNumber } = await req.json();
    if (!uploadId || !key || !partNumber) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

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

    const command = new UploadPartCommand({
      Bucket: awsBucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    return NextResponse.json({ success: true, url: uploadUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
