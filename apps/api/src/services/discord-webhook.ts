import type { Logger } from "@openrift/shared/logger";
import type { Selectable } from "kysely";

import type { FieldChange, PrintingEventsTable } from "../db/index.js";

type PrintingEvent = Selectable<PrintingEventsTable>;

// Discord allows up to 10 embeds per message
const MAX_EMBEDS_PER_MESSAGE = 10;
// If more than this many new printings in a batch, send a summary instead
const SUMMARY_THRESHOLD = 20;

const COLOR_NEW = 0x57_f2_87; // green
const COLOR_CHANGED = 0xfe_e7_5c; // yellow

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
}

interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

/**
 * Build Discord embed messages from a batch of printing events and send them
 * to the configured webhook URLs.
 *
 * @returns IDs of events that were successfully delivered.
 */
export async function flushPrintingEvents(
  events: PrintingEvent[],
  webhookUrls: { newPrintings: string | null; printingChanges: string | null },
  log: Logger,
): Promise<{ sentIds: string[]; failedIds: string[] }> {
  const newEvents = events.filter((e) => e.eventType === "new");
  const changedEvents = events.filter((e) => e.eventType === "changed");

  const sentIds: string[] = [];
  const failedIds: string[] = [];

  // Send new printing notifications
  if (newEvents.length > 0 && webhookUrls.newPrintings) {
    const payloads = buildNewPrintingPayloads(newEvents);
    const success = await sendPayloads(webhookUrls.newPrintings, payloads, log);
    for (const event of newEvents) {
      if (success) {
        sentIds.push(event.id);
      } else {
        failedIds.push(event.id);
      }
    }
  } else {
    // No webhook configured; mark as sent to avoid infinite retry
    for (const event of newEvents) {
      sentIds.push(event.id);
    }
  }

  // Send change notifications
  if (changedEvents.length > 0 && webhookUrls.printingChanges) {
    const payloads = buildChangedPrintingPayloads(changedEvents);
    const success = await sendPayloads(webhookUrls.printingChanges, payloads, log);
    for (const event of changedEvents) {
      if (success) {
        sentIds.push(event.id);
      } else {
        failedIds.push(event.id);
      }
    }
  } else {
    for (const event of changedEvents) {
      sentIds.push(event.id);
    }
  }

  return { sentIds, failedIds };
}

/**
 * Build webhook payloads for new printing events.
 * If there are many, send a summary. Otherwise, one embed per printing.
 *
 * @returns Array of Discord webhook payloads to send.
 */
export function buildNewPrintingPayloads(events: PrintingEvent[]): DiscordWebhookPayload[] {
  if (events.length > SUMMARY_THRESHOLD) {
    return buildNewPrintingSummary(events);
  }

  const embeds: DiscordEmbed[] = events.map((event) => ({
    title: `New: ${event.cardName}`,
    color: COLOR_NEW,
    fields: [
      ...(event.shortCode ? [{ name: "Code", value: event.shortCode, inline: true }] : []),
      ...(event.setName ? [{ name: "Set", value: event.setName, inline: true }] : []),
      ...(event.rarity ? [{ name: "Rarity", value: event.rarity, inline: true }] : []),
      ...(event.finish && event.finish !== "normal"
        ? [{ name: "Finish", value: event.finish, inline: true }]
        : []),
      ...(event.artist ? [{ name: "Artist", value: event.artist, inline: true }] : []),
      ...(event.language && event.language !== "EN"
        ? [{ name: "Language", value: event.language, inline: true }]
        : []),
    ],
    timestamp: event.createdAt.toISOString(),
  }));

  return chunkEmbeds(embeds);
}

/**
 * Build a compact summary for large batches of new printings.
 *
 * @returns Array of Discord webhook payloads.
 */
function buildNewPrintingSummary(events: PrintingEvent[]): DiscordWebhookPayload[] {
  // Group by set for a nicer summary
  const bySet = Map.groupBy(events, (e) => e.setName ?? "Unknown Set");
  const lines: string[] = [];

  for (const [setName, setEvents] of bySet) {
    const cardNames = setEvents.map((e) => e.cardName);
    const uniqueNames = [...new Set(cardNames)];
    if (uniqueNames.length <= 10) {
      lines.push(`**${setName}** (${uniqueNames.length}): ${uniqueNames.join(", ")}`);
    } else {
      const shown = uniqueNames.slice(0, 10).join(", ");
      lines.push(
        `**${setName}** (${uniqueNames.length}): ${shown}, and ${uniqueNames.length - 10} more`,
      );
    }
  }

  const description = lines.join("\n");

  // Discord embed description limit is 4096 chars; split if needed
  if (description.length <= 4000) {
    return [
      {
        embeds: [
          {
            title: `${events.length} new printings added`,
            description,
            color: COLOR_NEW,
            timestamp: events[0].createdAt.toISOString(),
          },
        ],
      },
    ];
  }

  // If description is too long, split into multiple embeds
  const payloads: DiscordWebhookPayload[] = [];
  let currentLines: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    if (currentLength + line.length + 1 > 4000 && currentLines.length > 0) {
      payloads.push({
        embeds: [
          {
            title: `${events.length} new printings added`,
            description: currentLines.join("\n"),
            color: COLOR_NEW,
            timestamp: events[0].createdAt.toISOString(),
          },
        ],
      });
      currentLines = [];
      currentLength = 0;
    }
    currentLines.push(line);
    currentLength += line.length + 1;
  }

  if (currentLines.length > 0) {
    payloads.push({
      embeds: [
        {
          title: `${events.length} new printings added (continued)`,
          description: currentLines.join("\n"),
          color: COLOR_NEW,
          timestamp: events[0].createdAt.toISOString(),
        },
      ],
    });
  }

  return payloads;
}

/**
 * Build webhook payloads for changed printing events.
 * Consolidates multiple changes to the same printing into one embed.
 *
 * @returns Array of Discord webhook payloads to send.
 */
export function buildChangedPrintingPayloads(events: PrintingEvent[]): DiscordWebhookPayload[] {
  // Consolidate events for the same printing
  const byPrinting = Map.groupBy(events, (e) => e.printingId);
  const embeds: DiscordEmbed[] = [];

  for (const [, printingEvents] of byPrinting) {
    const first = printingEvents[0];
    const allChanges: FieldChange[] = [];

    for (const event of printingEvents) {
      const changes = event.changes ?? [];
      allChanges.push(...changes);
    }

    // Deduplicate: if the same field changed multiple times, keep the earliest "from"
    // and latest "to"
    const fieldMap = new Map<string, { from: unknown; to: unknown }>();
    for (const change of allChanges) {
      const existing = fieldMap.get(change.field);
      if (existing) {
        existing.to = change.to;
      } else {
        fieldMap.set(change.field, { from: change.from, to: change.to });
      }
    }

    const fields = [...fieldMap.entries()].map(([field, { from, to }]) => ({
      name: field,
      value: `${formatValue(from)} \u2192 ${formatValue(to)}`,
      inline: false,
    }));

    const titleParts = [first.cardName];
    if (first.shortCode) {
      titleParts.push(`(${first.shortCode})`);
    }

    embeds.push({
      title: `Updated: ${titleParts.join(" ")}`,
      color: COLOR_CHANGED,
      fields,
      timestamp: first.createdAt.toISOString(),
    });
  }

  return chunkEmbeds(embeds);
}

/**
 * Format a field value for display in Discord.
 *
 * @returns A string representation of the value.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "*empty*";
  }
  const str = String(value);
  if (str.length > 100) {
    return `${str.slice(0, 97)}...`;
  }
  return str;
}

/**
 * Split embeds into chunks of MAX_EMBEDS_PER_MESSAGE.
 *
 * @returns Array of Discord webhook payloads.
 */
function chunkEmbeds(embeds: DiscordEmbed[]): DiscordWebhookPayload[] {
  const payloads: DiscordWebhookPayload[] = [];
  for (let i = 0; i < embeds.length; i += MAX_EMBEDS_PER_MESSAGE) {
    payloads.push({ embeds: embeds.slice(i, i + MAX_EMBEDS_PER_MESSAGE) });
  }
  return payloads;
}

/**
 * Send an array of payloads to a Discord webhook URL.
 * Pauses briefly between messages to avoid rate-limiting.
 *
 * @returns true if all payloads sent successfully, false if any failed.
 */
async function sendPayloads(
  webhookUrl: string,
  payloads: DiscordWebhookPayload[],
  log: Logger,
): Promise<boolean> {
  let allOk = true;

  for (const payload of payloads) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        log.warn({ status: response.status, body }, "Discord webhook request failed");
        allOk = false;
      }
    } catch (error) {
      log.warn({ error }, "Discord webhook request error");
      allOk = false;
    }

    // Brief pause between messages to respect rate limits
    if (payloads.length > 1) {
      await Bun.sleep(1000);
    }
  }

  return allOk;
}
