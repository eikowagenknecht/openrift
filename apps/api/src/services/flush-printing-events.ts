import type { Logger } from "@openrift/shared/logger";

import type { printingEventsRepo } from "../repositories/printing-events.js";
import type { siteSettingsRepo } from "../repositories/site-settings.js";
import { flushPrintingEvents } from "./discord-webhook.js";

type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;
type SiteSettingsRepo = ReturnType<typeof siteSettingsRepo>;

const SETTING_KEY_NEW = "discord-webhook-new-printings";
const SETTING_KEY_CHANGES = "discord-webhook-printing-changes";

/**
 * Flush pending printing events to Discord webhooks.
 * Reads webhook URLs from site_settings, consolidates events, and sends.
 *
 * @returns Summary of sent and failed event counts.
 */
export async function flushPendingPrintingEvents(
  repos: {
    printingEvents: PrintingEventsRepo;
    siteSettings: SiteSettingsRepo;
  },
  log: Logger,
): Promise<{ sent: number; failed: number }> {
  const events = await repos.printingEvents.listPending();
  if (events.length === 0) {
    return { sent: 0, failed: 0 };
  }

  // Read webhook URLs from site settings
  const settings = await repos.siteSettings.listByScope("api");
  const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

  const webhookUrls = {
    newPrintings: settingsMap.get(SETTING_KEY_NEW) ?? null,
    printingChanges: settingsMap.get(SETTING_KEY_CHANGES) ?? null,
  };

  const { sentIds, failedIds } = await flushPrintingEvents(events, webhookUrls, log);

  await repos.printingEvents.markSent(sentIds);
  await repos.printingEvents.markRetry(failedIds);

  log.info(
    { sent: sentIds.length, failed: failedIds.length, total: events.length },
    "Flushed printing events",
  );

  return { sent: sentIds.length, failed: failedIds.length };
}
