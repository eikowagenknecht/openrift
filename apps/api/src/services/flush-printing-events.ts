import type { Logger } from "@openrift/shared/logger";

import type { printingEventsRepo } from "../repositories/printing-events.js";
import type { WebhookFailure } from "./discord-webhook.js";
import { flushPrintingEvents } from "./discord-webhook.js";

type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;

interface DiscordWebhookUrls {
  newPrintings: string | null;
  printingChanges: string | null;
}

export interface FlushSummary {
  sent: number;
  failed: number;
  failures?: WebhookFailure[];
}

function describeFailures(failures: WebhookFailure[]): string {
  return failures
    .map((f) => {
      const status = f.status === undefined ? "fetch error" : `HTTP ${f.status}`;
      const detail = f.detail.length > 200 ? `${f.detail.slice(0, 197)}...` : f.detail;
      return `${f.channel}: ${status} ${detail}`.trim();
    })
    .join(" | ");
}

/**
 * Flush pending printing events to Discord webhooks.
 * Webhook URLs come from environment variables (DISCORD_WEBHOOK_*).
 *
 * Marks succeeded events `sent` and increments retry counts on failures.
 * Throws when every attempted webhook call failed so the caller's job_runs
 * row records a real error_message; partial failures return normally with
 * `failures` included in the summary.
 *
 * @returns Summary of sent/failed counts plus optional per-channel failure
 * detail. Throws if all delivery attempts failed.
 */
export async function flushPendingPrintingEvents(
  repos: { printingEvents: PrintingEventsRepo },
  webhookUrls: DiscordWebhookUrls,
  appBaseUrl: string,
  log: Logger,
): Promise<FlushSummary> {
  const events = await repos.printingEvents.listPending();
  if (events.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const { sentIds, failedIds, failures } = await flushPrintingEvents(
    events,
    webhookUrls,
    appBaseUrl,
    log,
  );

  await repos.printingEvents.markSent(sentIds);
  await repos.printingEvents.markRetry(failedIds);

  log.info(
    { sent: sentIds.length, failed: failedIds.length, total: events.length },
    "Flushed printing events",
  );

  if (sentIds.length === 0 && failedIds.length > 0) {
    throw new Error(`Discord webhook delivery failed: ${describeFailures(failures)}`);
  }

  return {
    sent: sentIds.length,
    failed: failedIds.length,
    ...(failures.length > 0 ? { failures } : {}),
  };
}
