import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getDb } from "./lib/mongodb";
import { renderWithFfmpeg } from "./lib/ffmpeg-render";
import { createReadStream } from "fs";
import { stat, unlink } from "fs/promises";
import path from "path";

// ── Configurations ──────────────────────────────────────────────────────────
const region = process.env.AWS_REGION || "eu-north-1";
const queueUrl = process.env.AWS_SQS_QUEUE_URL;
const s3Bucket = process.env.S3_BUCKET_NAME || "vydeoai"; // Fallback to your bucket

const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!awsAccessKey || !awsSecretKey || !queueUrl) {
  console.error("❌ CRITICAL ERROR: SQS/S3 Credentials or AWS_SQS_QUEUE_URL missing in environment!");
  process.exit(1);
}

// Initialize Clients
const sqsClient = new SQSClient({
  region,
  credentials: { accessKeyId: awsAccessKey, secretAccessKey: awsSecretKey },
});

const s3Client = new S3Client({
  region,
  credentials: { accessKeyId: awsAccessKey, secretAccessKey: awsSecretKey },
});

// Helper: Upload file to S3
async function uploadRenderToS3(localPath: string, s3Key: string): Promise<string> {
  console.log(`[S3] Uploading render to S3: ${s3Key}...`);
  const fileStream = createReadStream(localPath);
  const fileStat = await stat(localPath);

  const command = new PutObjectCommand({
    Bucket: s3Bucket,
    Key: s3Key,
    Body: fileStream,
    ContentType: "video/mp4",
    ContentLength: fileStat.size,
  });

  await s3Client.send(command);
  
  // Return the public-facing download URL
  const publicUrl = `https://${s3Bucket}.s3.${region}.amazonaws.com/${s3Key}`;
  console.log(`[S3] Upload complete! Public URL: ${publicUrl}`);
  return publicUrl;
}

// ── Worker Loop ─────────────────────────────────────────────────────────────
async function startWorker() {
  console.log("🚀 Decoupled Video Rendering Background Worker is starting up...");
  console.log(`Queue URL: ${queueUrl}`);
  console.log(`S3 Bucket: ${s3Bucket}`);
  console.log("Listening for rendering jobs...");

  const db = await getDb();

  while (true) {
    try {
      // Long-poll SQS (waits up to 20 seconds for a message; uses $0 cost when empty)
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        })
      );

      if (!response.Messages || response.Messages.length === 0) {
        // No messages, loop again
        continue;
      }

      const message = response.Messages[0];
      const receiptHandle = message.ReceiptHandle;
      
      console.log(`[Worker] Received message! Message ID: ${message.MessageId}`);

      const body = JSON.parse(message.Body || "{}");
      const { jobId, params } = body;

      if (!jobId || !params) {
        console.error("[Worker] Invalid message body, skipping...");
        if (receiptHandle) {
          await sqsClient.send(
            new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle })
          );
        }
        continue;
      }

      console.log(`[Worker] Started processing job: ${jobId}`);

      // 1. Update status to "rendering"
      await db.collection("render_jobs").updateOne(
        { id: jobId },
        { $set: { status: "rendering", startedAt: new Date() } }
      );

      try {
        // 2. Render locally using FFmpeg
        const renderResult = await renderWithFfmpeg(params);
        
        if (!renderResult.outputPath) {
          throw new Error("FFmpeg rendering failed: outputPath is missing.");
        }

        // 3. Upload completed video to S3
        const s3Key = `renders/${jobId}-${path.basename(renderResult.outputPath)}`;
        const publicUrl = await uploadRenderToS3(renderResult.outputPath, s3Key);

        // 4. Update MongoDB to "completed"
        await db.collection("render_jobs").updateOne(
          { id: jobId },
          {
            $set: {
              status: "completed",
              downloadUrl: publicUrl,
              completedAt: new Date(),
            },
          }
        );

        console.log(`✅ [Worker] Successfully finished job: ${jobId}`);

        // 5. Clean up local rendered temp file
        await unlink(renderResult.outputPath).catch((err) => {
          console.error(`[Worker] Cleanup warning: Failed to delete finished temp file:`, err);
        });

      } catch (renderError: any) {
        console.error(`❌ [Worker] Rendering failed for job ${jobId}:`, renderError);

        // Update MongoDB state to "failed"
        await db.collection("render_jobs").updateOne(
          { id: jobId },
          {
            $set: {
              status: "failed",
              error: renderError.message || String(renderError),
              failedAt: new Date(),
            },
          }
        );
      } finally {
        // 6. Delete message from SQS (success or failure, we don't want infinite loops)
        if (receiptHandle) {
          await sqsClient.send(
            new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle })
          );
          console.log(`[Worker] Message deleted from SQS: ${message.MessageId}`);
        }
      }

    } catch (loopError) {
      console.error("[Worker] Loop Error occurred:", loopError);
      // Wait 5 seconds before retrying on crash to prevent spam
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// Start executing
startWorker().catch((err) => {
  console.error("Fatal Worker Process Failure:", err);
  process.exit(1);
});
