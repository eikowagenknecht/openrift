import type { Logger } from "@openrift/shared/logger";

import type { FieldChange } from "../db/index.js";
import type { EnrichedPrintingEvent } from "../repositories/printing-events.js";

// Discord allows up to 10 embeds per message
const MAX_EMBEDS_PER_MESSAGE = 10;
// If more than this many new printings in a batch, send a summary instead
const SUMMARY_THRESHOLD = 20;

const COLOR_NEW = 0x57_f2_87; // green
const COLOR_CHANGED = 0xfe_e7_5c; // yellow

interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  image?: { url: string };
  author?: { name: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

// Discord requires absolute URLs for embed images. Stored image paths are
// relative (e.g. "/media/cards/xx/uuid-400w.webp"); prepend the app base URL.
function absoluteImageUrl(appBaseUrl: string, url: string | null): string | undefined {
  if (!url) {
    return undefined;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${appBaseUrl}${url}`;
}

/**
 * Build Discord embed messages from a batch of printing events and send them
 * to the configured webhook URLs.
 *
 * @returns IDs of events that were successfully delivered.
 */
export async function flushPrintingEvents(
  events: EnrichedPrintingEvent[],
  webhookUrls: { newPrintings: string | null; printingChanges: string | null },
  appBaseUrl: string,
  log: Logger,
): Promise<{ sentIds: string[]; failedIds: string[] }> {
  const newEvents = events.filter((e) => e.eventType === "new");
  const changedEvents = events.filter((e) => e.eventType === "changed");

  const sentIds: string[] = [];
  const failedIds: string[] = [];

  if (newEvents.length > 0 && webhookUrls.newPrintings) {
    const payloads = buildNewPrintingPayloads(newEvents, appBaseUrl);
    const success = await sendPayloads(webhookUrls.newPrintings, payloads, log);
    for (const event of newEvents) {
      (success ? sentIds : failedIds).push(event.id);
    }
  } else {
    for (const event of newEvents) {
      sentIds.push(event.id);
    }
  }

  if (changedEvents.length > 0 && webhookUrls.printingChanges) {
    const payloads = buildChangedPrintingPayloads(changedEvents, appBaseUrl);
    const success = await sendPayloads(webhookUrls.printingChanges, payloads, log);
    for (const event of changedEvents) {
      (success ? sentIds : failedIds).push(event.id);
    }
  } else {
    for (const event of changedEvents) {
      sentIds.push(event.id);
    }
  }

  return { sentIds, failedIds };
}

function cardUrl(appBaseUrl: string, slug: string | null): string | undefined {
  if (!slug) {
    return undefined;
  }
  return `${appBaseUrl}/cards/${slug}`;
}

/**
 * Build webhook payloads for new printing events.
 *
 * @returns Array of Discord webhook payloads to send.
 */
export function buildNewPrintingPayloads(
  events: EnrichedPrintingEvent[],
  appBaseUrl: string,
): DiscordWebhookPayload[] {
  if (events.length > SUMMARY_THRESHOLD) {
    return buildNewPrintingSummary(events, appBaseUrl);
  }

  const embeds: DiscordEmbed[] = events.map((event) => {
    const headerParts: string[] = [];
    if (event.shortCode) {
      headerParts.push(`**${event.shortCode}**`);
    }
    if (event.rarity) {
      headerParts.push(event.rarity);
    }
    if (event.finish && event.finish !== "normal") {
      headerParts.push(event.finishLabel ?? event.finish);
    }
    if (event.language && event.language !== "EN") {
      headerParts.push(event.languageName ?? event.language);
    }

    const lines: string[] = [];
    if (headerParts.length > 0) {
      lines.push(headerParts.join(" · "));
    }
    if (event.artist) {
      lines.push(`Artist: ${event.artist}`);
    }

    const image = absoluteImageUrl(appBaseUrl, event.frontImageUrl);

    return {
      ...(event.setName ? { author: { name: event.setName } } : {}),
      title: `New: ${event.cardName ?? "Unknown Card"}`,
      url: cardUrl(appBaseUrl, event.cardSlug),
      color: COLOR_NEW,
      ...(lines.length > 0 ? { description: lines.join("\n") } : {}),
      ...(image ? { image: { url: image } } : {}),
      timestamp: event.createdAt.toISOString(),
    };
  });

  return chunkEmbeds(embeds);
}

/**
 * Build a compact summary for large batches of new printings.
 *
 * @returns Array of Discord webhook payloads.
 */
function buildNewPrintingSummary(
  events: EnrichedPrintingEvent[],
  appBaseUrl: string,
): DiscordWebhookPayload[] {
  const bySet = Map.groupBy(events, (e) => e.setName ?? "Unknown Set");
  const lines: string[] = [];

  for (const [setName, setEvents] of bySet) {
    const uniqueCards = [...new Map(setEvents.map((e) => [e.cardName, e])).values()];
    if (uniqueCards.length <= 10) {
      const links = uniqueCards.map((e) => {
        const url = cardUrl(appBaseUrl, e.cardSlug);
        return url ? `[${e.cardName}](${url})` : (e.cardName ?? "?");
      });
      lines.push(`**${setName}** (${uniqueCards.length}): ${links.join(", ")}`);
    } else {
      const shown = uniqueCards.slice(0, 10).map((e) => {
        const url = cardUrl(appBaseUrl, e.cardSlug);
        return url ? `[${e.cardName}](${url})` : (e.cardName ?? "?");
      });
      lines.push(
        `**${setName}** (${uniqueCards.length}): ${shown.join(", ")}, and ${uniqueCards.length - 10} more`,
      );
    }
  }

  const description = lines.join("\n");

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
export function buildChangedPrintingPayloads(
  events: EnrichedPrintingEvent[],
  appBaseUrl: string,
): DiscordWebhookPayload[] {
  const byPrinting = Map.groupBy(events, (e) => e.printingId);
  const embeds: DiscordEmbed[] = [];

  for (const [, printingEvents] of byPrinting) {
    const first = printingEvents[0];
    const allChanges: FieldChange[] = [];

    for (const event of printingEvents) {
      allChanges.push(...(event.changes ?? []));
    }

    // Deduplicate: keep earliest "from" and latest "to" per field
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

    const titleParts = [first.cardName ?? "Unknown Card"];
    if (first.shortCode) {
      titleParts.push(`(${first.shortCode})`);
    }

    const thumbnail = absoluteImageUrl(appBaseUrl, first.frontImageUrl);

    embeds.push({
      title: `Updated: ${titleParts.join(" ")}`,
      url: cardUrl(appBaseUrl, first.cardSlug),
      color: COLOR_CHANGED,
      ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
      fields,
      timestamp: first.createdAt.toISOString(),
    });
  }

  return chunkEmbeds(embeds);
}

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

function chunkEmbeds(embeds: DiscordEmbed[]): DiscordWebhookPayload[] {
  const payloads: DiscordWebhookPayload[] = [];
  for (let i = 0; i < embeds.length; i += MAX_EMBEDS_PER_MESSAGE) {
    payloads.push({ embeds: embeds.slice(i, i + MAX_EMBEDS_PER_MESSAGE) });
  }
  return payloads;
}

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

    if (payloads.length > 1) {
      await Bun.sleep(1000);
    }
  }

  return allOk;
}
