import type { Logger } from "@openrift/shared/logger";

import type { WebhookFailure } from "../../system/services/discord-webhook.js";
import { flushPrintingEvents } from "../../system/services/discord-webhook.js";
import type { printingEventsRepo } from "../repositories/printing-events.js";

type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;

interface DiscordWebhookUrls {
  newPrintings: string | null;
}

interface FlushSummary {
  sent: number;
  failed: number;
  failures?: WebhookFailure[];
}

export function isPrintingFlushNoop(summary: { sent: number; failed: number }): boolean {
  return summary.sent === 0 && summary.failed === 0;
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
 * Throws when every attempted webhook call failed so the caller's job_runs
 * row records a real error_message; partial failures return normally.
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
