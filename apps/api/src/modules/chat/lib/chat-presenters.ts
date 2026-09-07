/**
 * Presenters for the chat-bot lookup endpoint (`GET /api/v1/chat/card`).
 *
 * Output must be one line (no newline) and ≤400 characters: Twitch caps a
 * message at 500 and the bot prepends its own text. The card URL is never
 * trimmed; the name and stat line share whatever space remains.
 */

import type { CardStatLabels } from "@openrift/shared/card-stat-line";
import { describeCardStats } from "@openrift/shared/card-stat-line";
import { legendDisplayName, truncateWithEllipsis } from "@openrift/shared/utils";

const CHAT_LINE_LIMIT = 400;

const NAME_LIMIT = 80;

const QUERY_LIMIT = 60;

const SEPARATOR = " — ";

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

/**
 * Applied to everything echoed into a line, both the user's query and the
 * catalogue's card name, so no input can split the chat message in two.
 */
function oneLine(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

/**
 * The line for a found card. `siteUrl` is the deployment's own origin (preview
 * and production each render their own), so it is absent only when the API has
 * no configured origin — in which case the line still carries the card, just
 * without a link.
 */
export function chatCardLine(card: ChatCard, labels: CardStatLabels, siteUrl?: string): string {
  const tail = siteUrl ? `${SEPARATOR}${siteUrl}/cards/${card.slug}` : "";
  const name = truncateWithEllipsis(oneLine(legendDisplayName(card)), NAME_LIMIT);
  const room = CHAT_LINE_LIMIT - name.length - tail.length - SEPARATOR.length;
  const description = truncateWithEllipsis(describeCardStats(card, labels), room);
  return description ? `${name}${SEPARATOR}${description}${tail}` : `${name}${tail}`;
}

export function chatMissLine(query: string, siteUrl?: string): string {
  const safe = truncateWithEllipsis(oneLine(query), QUERY_LIMIT);
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
