/**
 * Presenters for the chat-bot lookup endpoint (`GET /api/v1/chat/card`).
 *
 * Every line here is pasted verbatim into a Twitch/Discord chat message by a
 * bot's url-fetch command, so all of them are plain, single-line text — hits,
 * misses and bad input alike. Two constraints shape the formatting:
 *
 * - **One line.** A newline would split into two chat messages (or be dropped),
 *   so nothing here may emit one, including the echoed user query.
 * - **≤ 400 characters.** Twitch caps a message at 500 and the bot prepends its
 *   own text, so the body leaves headroom. The card URL is the whole point of
 *   the line and is never trimmed; the name and stat line share what's left.
 *
 * The stat line mirrors the Discord bot's `describeCard`, so a card reads the
 * same in a Twitch chat and in a Discord embed.
 */

import { legendDisplayName } from "@openrift/shared";

/** Character budget for a response line. See the module comment. */
const CHAT_LINE_LIMIT = 400;

/** Cap on the echoed card name, so a long name can't crowd out the stat line. */
const NAME_LIMIT = 80;

/** Cap on the echoed user query in a miss line. Chat queries are short; anything
 * longer is someone pasting, and the line still has to fit the budget. */
const QUERY_LIMIT = 60;

/** Separator between the line's segments, matching the Discord bot's em dash. */
const SEPARATOR = " — ";

/** Slug → display label for the enum groups the stat line names. */
export interface ChatEnumLabels {
  cardTypes: Record<string, string>;
  superTypes: Record<string, string>;
  domains: Record<string, string>;
}

export interface ChatCard {
  slug: string;
  name: string;
  superTypes: readonly string[];
  types: readonly string[];
  tags: readonly string[];
  domains: readonly string[];
  energy: number | null;
  might: number | null;
  power: number | null;
}

function truncate(text: string, max: number): string {
  if (max <= 0) {
    return "";
  }
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Applied to everything echoed into a line, both the user's query and the
 * catalogue's card name, so no input can split the chat message in two.
 */
function oneLine(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

/**
 * The card's type, domains and stats, in the Discord bot's `describeCard`
 * order and separators.
 */
function describeChatCard(card: ChatCard, labels: ChatEnumLabels): string {
  const typeLine = [
    ...card.superTypes.map((slug) => labels.superTypes[slug]),
    ...card.types.map((slug) => labels.cardTypes[slug]),
  ]
    .filter(Boolean)
    .join(" ");
  const parts = typeLine ? [typeLine] : [];
  if (card.domains.length > 0) {
    parts.push(
      card.domains
        .map((slug) => labels.domains[slug])
        .filter(Boolean)
        .join(" / "),
    );
  }
  if (card.energy !== null) {
    parts.push(`Energy ${card.energy}`);
  }
  if (card.might !== null) {
    parts.push(`Might ${card.might}`);
  }
  if (card.power !== null) {
    parts.push(`Power ${card.power}`);
  }
  return parts.filter(Boolean).join(" · ");
}

/**
 * The line for a found card. `siteUrl` is the deployment's own origin (preview
 * and production each render their own), so it is absent only when the API has
 * no configured origin — in which case the line still carries the card, just
 * without a link.
 */
export function chatCardLine(card: ChatCard, labels: ChatEnumLabels, siteUrl?: string): string {
  const tail = siteUrl ? `${SEPARATOR}${siteUrl}/cards/${card.slug}` : "";
  const name = truncate(oneLine(legendDisplayName(card)), NAME_LIMIT);
  const room = CHAT_LINE_LIMIT - name.length - tail.length - SEPARATOR.length;
  const description = truncate(describeChatCard(card, labels), room);
  return description ? `${name}${SEPARATOR}${description}${tail}` : `${name}${tail}`;
}

export function chatMissLine(query: string, siteUrl?: string): string {
  const safe = truncate(oneLine(query), QUERY_LIMIT);
  const tail = siteUrl ? ` Try ${siteUrl}/cards?search=${encodeURIComponent(safe)}` : "";
  return `No Riftbound card found for "${safe}".${tail}`;
}

export function chatUsageLine(siteUrl?: string): string {
  const tail = siteUrl ? ` Browse every card at ${siteUrl}/cards` : "";
  return `Look up a Riftbound card by name or code, e.g. "viktor" or "OGN-202".${tail}`;
}

/**
 * The line for a lookup that failed on our side. Kept distinct from
 * {@link chatMissLine}: telling chat the card doesn't exist when the catalogue
 * simply failed to load sends the viewer looking for a mistake they didn't make.
 */
export function chatErrorLine(siteUrl?: string): string {
  const tail = siteUrl ? ` Search directly at ${siteUrl}/cards` : "";
  return `Card lookup is temporarily unavailable.${tail}`;
}
