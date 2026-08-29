import { legendDisplayName } from "@openrift/shared";
import type { APIEmbed, APIEmbedField } from "discord.js";

import {
  cardTextFields,
  describeCard,
  EMBED_COLOR,
  FIELD_LIMIT,
  printingFooter,
  truncate,
} from "./card-embed.js";
import type { CatalogCard, CatalogPrinting, CatalogSnapshot } from "./catalog-cache.js";
import type { GlyphEmojis } from "./glyph-emoji.js";
import { NO_GLYPH_EMOJIS } from "./glyph-emoji.js";

/**
 * Prefix of the Details button's custom id. The rest is the card id and the
 * printing the reply was showing, so the ephemeral follow-up describes the
 * same printing the user was looking at. The bot keeps no state between the
 * reply and the click — the button carries everything it needs.
 */
const DETAILS_PREFIX = "card-details";

/** Discord's cap on a button label. */
const LABEL_LIMIT = 80;

export interface CardDetailsInput {
  card: CatalogCard;
  printing: CatalogPrinting | undefined;
  snapshot: CatalogSnapshot;
  /** Glyph token → custom emoji mention; defaults to none, which renders glyphs as words. */
  emojis?: GlyphEmojis;
  siteUrl: string;
}

/**
 * The custom id of a card's Details button. Card and printing ids are UUIDs,
 * which keeps this inside Discord's 100-character limit.
 *
 * @returns The custom id to put on the button.
 */
export function detailsCustomId(cardId: string, printingId?: string): string {
  return `${DETAILS_PREFIX}:${cardId}:${printingId ?? ""}`;
}

/**
 * Reads back what {@link detailsCustomId} encoded.
 *
 * @returns The ids, or null when the custom id belongs to something else.
 */
export function parseDetailsCustomId(
  customId: string,
): { cardId: string; printingId: string | null } | null {
  const [prefix, cardId, printingId, ...rest] = customId.split(":");
  if (prefix !== DETAILS_PREFIX || !cardId || printingId === undefined || rest.length > 0) {
    return null;
  }
  return { cardId, printingId: printingId || null };
}

/**
 * The Details button's label. A single-card reply just says "Details"; a
 * message answering several `[[card]]` mentions carries one button per card,
 * so those name the card they belong to.
 *
 * @returns The label, within Discord's length limit.
 */
export function detailsLabel(cardName: string, multiple: boolean): string {
  return multiple ? truncate(`Details: ${cardName}`, LABEL_LIMIT) : "Details";
}

/**
 * The ban field for the ephemeral details: one line per active ban, with the
 * reason where the catalogue has one. The card embed already says *that* the
 * card is banned; this says why.
 *
 * @returns The field, or null when the card is not banned.
 */
function banField(card: CatalogCard): APIEmbedField | null {
  if (card.bans.length === 0) {
    return null;
  }
  const lines = card.bans.map((ban) =>
    ban.reason ? `**${ban.formatName}** ${ban.reason}` : `**${ban.formatName}**`,
  );
  return {
    name: card.bans.length === 1 ? "Ban" : "Bans",
    value: truncate(lines.join("\n"), FIELD_LIMIT),
  };
}

/**
 * Builds the ephemeral follow-up behind the Details button: the stat line and
 * the card's rules and effect text, i.e. everything the card embed leaves off
 * because it is legible on the artwork. Ephemeral, so reading the details
 * never adds a message to the channel.
 *
 * @returns A plain APIEmbed ready to send.
 */
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
    description: describeCard(card, snapshot.labels),
    color: EMBED_COLOR,
    ...(fields.length > 0 ? { fields } : {}),
    ...(printing ? { footer: { text: printingFooter(printing, snapshot) } } : {}),
  };
}
