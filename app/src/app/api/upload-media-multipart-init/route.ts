import { NextRequest, NextResponse } from "next/server";
import { S3Client, CreateMultipartUploadCommand } from "@aws-sdk/client-s3";

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json();
    if (!filename) return NextResponse.json({ error: "Filename required" }, { status: 400 });

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

    const path = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const command = new CreateMultipartUploadCommand({
      Bucket: awsBucket,
      Key: path,
      ContentType: contentType || "video/mp4",
    });

    const response = await s3Client.send(command);
    return NextResponse.json({ success: true, uploadId: response.UploadId, key: path });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
