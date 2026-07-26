import { createHmac } from "node:crypto";
import { Worker, type Job } from "bullmq";
import { getBullConnection } from "./connection.js";
import { WEBHOOK_QUEUE_NAME, type WebhookDeliveryJobData } from "./webhook-queue.js";

/** Delivers one webhook event with an HMAC-SHA256 signature the receiver can
 * verify (`X-Raisely-Signature: sha256=<hex>` over the raw JSON body, keyed
 * by the endpoint's secret). A non-2xx response throws, which BullMQ retries
 * with backoff per the job's configured attempts. */
export function startWebhookWorker(): Worker<WebhookDeliveryJobData> {
  const worker = new Worker<WebhookDeliveryJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookDeliveryJobData>) => {
      const body = JSON.stringify({ event: job.data.eventType, data: job.data.payload });
      const signature = createHmac("sha256", job.data.secret).update(body).digest("hex");

      const res = await fetch(job.data.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-raisely-signature": `sha256=${signature}`,
        },
        body,
      });

      if (!res.ok) {
        throw new Error(`Webhook endpoint ${job.data.url} responded ${res.status}`);
      }
    },
    { connection: getBullConnection() }
  );

  worker.on("failed", (job, err) => {
    console.error(`webhook delivery job ${job?.id} (endpoint ${job?.data.endpointId}) failed:`, err);
  });

  return worker;
}
