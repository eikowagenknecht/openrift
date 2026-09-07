import { imageUrl, WellKnown } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";

import type { EnrichedPrintingEvent } from "../repositories/printing-events.js";

// Discord allows up to 10 embeds per message.
const MAX_EMBEDS_PER_MESSAGE = 10;
const SUMMARY_THRESHOLD = 20;

const COLOR_NEW = 0x57_f2_87;

interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  image?: { url: string };
  author?: { name: string; url?: string };
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

export interface WebhookFailure {
  channel: "newPrintings";
  status?: number;
  detail: string;
}

// Discord requires absolute URLs for embed images.
function absoluteImageUrl(appBaseUrl: string, id: string | null): string | undefined {
  if (!id) {
    return undefined;
  }
  return `${appBaseUrl}${imageUrl(id, "400w")}`;
}

export async function flushPrintingEvents(
  events: EnrichedPrintingEvent[],
  webhookUrls: { newPrintings: string | null },
  appBaseUrl: string,
  log: Logger,
): Promise<{ sentIds: string[]; failedIds: string[]; failures: WebhookFailure[] }> {
  const sentIds: string[] = [];
  const failedIds: string[] = [];
  const failures: WebhookFailure[] = [];

  if (events.length === 0) {
    return { sentIds, failedIds, failures };
  }

  if (webhookUrls.newPrintings) {
    const payloads = buildNewPrintingPayloads(events, appBaseUrl);
    const result = await sendPayloads(webhookUrls.newPrintings, payloads, log);
    for (const event of events) {
      (result.ok ? sentIds : failedIds).push(event.id);
    }
    for (const err of result.errors) {
      failures.push({ ...err, channel: "newPrintings" });
    }
  } else {
    for (const event of events) {
      sentIds.push(event.id);
    }
  }

  return { sentIds, failedIds, failures };
}

function cardUrl(appBaseUrl: string, slug: string | null): string | undefined {
  if (!slug) {
    return undefined;
  }
  return `${appBaseUrl}/cards/${slug}`;
}

export function buildNewPrintingPayloads(
  events: EnrichedPrintingEvent[],
  appBaseUrl: string,
): DiscordWebhookPayload[] {
  if (events.length > SUMMARY_THRESHOLD) {
    return buildNewPrintingSummary(events, appBaseUrl);
  }

  const siteName = appBaseUrl.replace(/^https?:\/\//u, "");

  const embeds: DiscordEmbed[] = events.map((event) => {
    const infoParts: string[] = [];
    if (event.setName) {
      infoParts.push(event.setName);
    }
    if (event.shortCode) {
      infoParts.push(event.shortCode);
    }
    if (event.rarity) {
      infoParts.push(event.rarityLabel ?? event.rarity);
    }
    if (event.finish && event.finish !== WellKnown.finish.NORMAL) {
      infoParts.push(event.finishLabel ?? event.finish);
    }
    if (event.language && event.language !== WellKnown.language.EN) {
      infoParts.push(event.languageName ?? event.language);
    }

    const image = absoluteImageUrl(appBaseUrl, event.frontImageId);

    return {
      author: { name: siteName, url: appBaseUrl },
      title: `New: ${event.cardName ?? "Unknown Card"}`,
      url: cardUrl(appBaseUrl, event.cardSlug),
      color: COLOR_NEW,
      ...(image ? { image: { url: image } } : {}),
      ...(infoParts.length > 0 ? { footer: { text: infoParts.join(" · ") } } : {}),
      timestamp: event.createdAt.toISOString(),
    };
  });

  return chunkEmbeds(embeds);
}

function buildNewPrintingSummary(
  events: EnrichedPrintingEvent[],
  appBaseUrl: string,
): DiscordWebhookPayload[] {
  const [firstEvent] = events;
  if (!firstEvent) {
    return [];
  }
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
            timestamp: firstEvent.createdAt.toISOString(),
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
            timestamp: firstEvent.createdAt.toISOString(),
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
          timestamp: firstEvent.createdAt.toISOString(),
        },
      ],
    });
  }

  return payloads;
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
): Promise<{ ok: boolean; errors: { status?: number; detail: string }[] }> {
  let allOk = true;
  const errors: { status?: number; detail: string }[] = [];

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
        errors.push({ status: response.status, detail: body });
        allOk = false;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log.warn({ error }, "Discord webhook request error");
      errors.push({ detail });
      allOk = false;
    }

    if (payloads.length > 1) {
      await Bun.sleep(1000);
    }
  }

  return { ok: allOk, errors };
}
