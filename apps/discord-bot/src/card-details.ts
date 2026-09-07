import { describeCardStats } from "@openrift/shared/card-stat-line";
import { legendDisplayName, truncateWithEllipsis } from "@openrift/shared/utils";
import type { APIEmbed, APIEmbedField } from "discord.js";

import { cardTextFields, EMBED_COLOR, FIELD_LIMIT, printingFooter } from "./card-embed.js";
import type { CatalogCard, CatalogPrinting, CatalogSnapshot } from "./catalog-cache.js";
import type { GlyphEmojis } from "./glyph-emoji.js";
import { NO_GLYPH_EMOJIS } from "./glyph-emoji.js";

const DETAILS_PREFIX = "card-details";

/** Discord's cap on a button label. */
const LABEL_LIMIT = 80;

export interface CardDetailsInput {
  card: CatalogCard;
  printing: CatalogPrinting | undefined;
  snapshot: CatalogSnapshot;
  emojis?: GlyphEmojis;
  siteUrl: string;
}

/** Card and printing ids are UUIDs, which keeps this inside Discord's 100-character custom-id limit. */
export function detailsCustomId(cardId: string, printingId?: string): string {
  return `${DETAILS_PREFIX}:${cardId}:${printingId ?? ""}`;
}

/** Reads back what {@link detailsCustomId} encoded; null when the custom id belongs to something else. */
export function parseDetailsCustomId(
  customId: string,
): { cardId: string; printingId: string | null } | null {
  const [prefix, cardId, printingId, ...rest] = customId.split(":");
  if (prefix !== DETAILS_PREFIX || !cardId || printingId === undefined || rest.length > 0) {
    return null;
  }
  return { cardId, printingId: printingId || null };
}

export function detailsLabel(cardName: string, multiple: boolean): string {
  return multiple ? truncateWithEllipsis(`Details: ${cardName}`, LABEL_LIMIT) : "Details";
}

/** The card embed already says a card is banned; this field says why. */
function banField(card: CatalogCard): APIEmbedField | null {
  if (card.bans.length === 0) {
    return null;
  }
  const lines = card.bans.map((ban) =>
    ban.reason ? `**${ban.formatName}** ${ban.reason}` : `**${ban.formatName}**`,
  );
  return {
    name: card.bans.length === 1 ? "Ban" : "Bans",
    value: truncateWithEllipsis(lines.join("\n"), FIELD_LIMIT),
  };
}

/** Stat line, rules, and effect text: everything the card embed leaves off because it's legible on the artwork. */
export function buildCardDetailsEmbed(input: CardDetailsInput): APIEmbed {
  const { card, printing, snapshot, siteUrl } = input;
  const bans = banField(card);
  const fields = [
    ...cardTextFields(card, printing, input.emojis ?? NO_GLYPH_EMOJIS),
    ...(bans ? [bans] : []),
  ];
  return {
    title: legendDisplayName(card),
    url: `${siteUrl}/cards/${card.slug}`,
    description: describeCardStats(card, snapshot.labels),
    color: EMBED_COLOR,
    ...(fields.length > 0 ? { fields } : {}),
    ...(printing ? { footer: { text: printingFooter(printing, snapshot) } } : {}),
  };
}
