import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { RenderParams } from "./transcoder";

const region = process.env.AWS_REGION || "eu-north-1";
const queueUrl = process.env.AWS_SQS_QUEUE_URL;

// Retrieve credentials safely from environment variables
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

// Only construct the client if credentials are configured
let sqsClient: SQSClient | null = null;

if (accessKeyId && secretAccessKey && queueUrl) {
  sqsClient = new SQSClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
} else {
  console.warn(
    "[SQS] Missing SQS credentials or AWS_SQS_QUEUE_URL. SQS rendering will fall back or fail."
  );
}

export async function sendRenderJob(
  jobId: string,
  params: RenderParams
): Promise<boolean> {
  if (!sqsClient || !queueUrl) {
    console.warn("[SQS] Client not initialized. Cannot enqueue render job.");
    return false;
  }

  try {
    const payload = {
      jobId,
      params,
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
      // Set MessageGroupId or deduplication if needed, but standard queues don't strictly require it
    });

    const response = await sqsClient.send(command);
    console.log(
      `[SQS] Render job successfully enqueued: ${jobId}. MessageId: ${response.MessageId}`
    );
    return true;
  } catch (error) {
    console.error("[SQS] Error pushing job to SQS queue:", error);
    throw error;
  }
}
