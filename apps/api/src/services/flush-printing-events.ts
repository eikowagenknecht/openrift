import type { Logger } from "@openrift/shared/logger";

import type { printingEventsRepo } from "../repositories/printing-events.js";
import { flushPrintingEvents } from "./discord-webhook.js";

type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;

interface DiscordWebhookUrls {
  newPrintings: string | null;
  printingChanges: string | null;
}

/**
 * Flush pending printing events to Discord webhooks.
 * Webhook URLs come from environment variables (DISCORD_WEBHOOK_*).
 *
 * @returns Summary of sent and failed event counts.
 */
export async function flushPendingPrintingEvents(
  repos: { printingEvents: PrintingEventsRepo },
  webhookUrls: DiscordWebhookUrls,
  appBaseUrl: string,
  log: Logger,
): Promise<{ sent: number; failed: number }> {
  const events = await repos.printingEvents.listPending();
  if (events.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const { sentIds, failedIds } = await flushPrintingEvents(events, webhookUrls, appBaseUrl, log);

  await repos.printingEvents.markSent(sentIds);
  await repos.printingEvents.markRetry(failedIds);

  log.info(
    { sent: sentIds.length, failed: failedIds.length, total: events.length },
    "Flushed printing events",
  );

  return { sent: sentIds.length, failed: failedIds.length };
}
