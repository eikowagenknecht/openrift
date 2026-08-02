import { foldForSearch, squashForSearch } from "@openrift/shared";

import type { CatalogCard, CatalogPrinting } from "./catalog-cache.js";
import type { TradelistHolders } from "./group-tradelists.js";

/** Cards named per scanned message before the reply collapses the rest. */
export const MAX_SCAN_MATCHES = 5;

/**
 * Longest card name to try, in tokens. Computed from the catalog at index
 * time and clamped here so a single absurd name can't make every message
 * scan quadratic.
 */
const MAX_NAME_TOKENS = 8;

/**
 * Shortest folded name allowed to match on its own. Every single-token card
 * name in the catalogue is at least four characters, so this only guards
 * against a future one- or two-letter name matching half the channel.
 */
const MIN_TOKEN_LENGTH = 3;

export interface ScanIndex {
  /** Space-joined scan key → the cards with that name (homonyms are possible). */
  byName: Map<string, CatalogCard[]>;
  /** Squashed printing code → the card it prints. */
  byCode: Map<string, CatalogCard>;
  /** Longest indexed name in tokens, so the matcher's window starts tight. */
  maxTokens: number;
}

/**
 * Regions a card name must not be read out of, blanked before matching:
 * fenced and inline code, links, Discord entities (mentions, channels, custom
 * emoji, timestamps), quoted lines, and `[[card name]]` references — those are
 * an explicit lookup and already answered by the mention path, so scanning
 * them again would reply twice.
 */
const IGNORED_REGIONS = [
  /```[\s\S]*?```/gu,
  /`[^`\n]*`/gu,
  /https?:\/\/\S+/gu,
  /<[^>\n]{1,100}>/gu,
  /\[\[[^\n[\]]*\]\]/gu,
  /^>\s.*$/gmu,
];

/**
 * Folds text the way card names are matched in free prose: the site's search
 * folding, then every separator becomes a token break. That makes matching
 * blind to the punctuation a card name carries but a chat message drops, so
 * "jinx rebel", "Jinx, Rebel" and "Jinx,Rebel." all reduce to the same tokens,
 * and "Quick-Draw" is found when someone types "quick draw".
 *
 * @returns The token sequence, empty for text with no letters or digits.
 */
export function scanTokens(text: string): string[] {
  return foldForSearch(text)
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Builds the scan index from a catalog snapshot: names as token sequences and
 * printing codes squashed the same way `/card` squashes them, so `OGN-202` in
 * a trade post resolves as precisely as it does in a slash command.
 *
 * @returns The index the matcher runs against.
 */
export function buildScanIndex(
  cards: CatalogCard[],
  printingsByCardId: Map<string, CatalogPrinting[]>,
): ScanIndex {
  const byName = new Map<string, CatalogCard[]>();
  const byCode = new Map<string, CatalogCard>();
  let maxTokens = 1;
  for (const card of cards) {
    const tokens = scanTokens(card.name);
    if (tokens.length === 0) {
      continue;
    }
    if (tokens.length === 1 && (tokens[0]?.length ?? 0) < MIN_TOKEN_LENGTH) {
      continue;
    }
    const key = tokens.join(" ");
    byName.set(key, [...(byName.get(key) ?? []), card]);
    maxTokens = Math.min(Math.max(maxTokens, tokens.length), MAX_NAME_TOKENS);
    for (const printing of printingsByCardId.get(card.id) ?? []) {
      for (const code of [printing.shortCode, printing.publicCode]) {
        const squashed = squashForSearch(code);
        if (squashed && !byCode.has(squashed)) {
          byCode.set(squashed, card);
        }
      }
    }
  }
  return { byName, byCode, maxTokens };
}

/**
 * Blanks the regions a name must not be read out of. Each match becomes a
 * space rather than nothing, so removing it can't fuse the words either side
 * into a name that was never written.
 *
 * @returns The message with those regions replaced by spaces.
 */
function stripIgnoredRegions(content: string): string {
  let text = content;
  for (const pattern of IGNORED_REGIONS) {
    text = text.replaceAll(pattern, " ");
  }
  return text;
}

/**
 * Finds card names written in ordinary prose, without brackets. Runs a
 * longest-match scan over the message's tokens, so "Jinx, Rebel" wins over a
 * card merely named "Jinx", and consumes what it matched before moving on.
 * Printing codes are matched separately and are the highest-precision signal
 * a trade post can carry.
 *
 * Matching is deliberately exact: a card is found only when its whole name is
 * written out. No prefixes, no fuzzy distance. In a channel where people talk
 * about League champions all day, a bare "Jinx" must not resolve to a card
 * called "Jinx, Rebel".
 *
 * @returns The distinct cards named, in order of first appearance, capped at
 * {@link MAX_SCAN_MATCHES}.
 */
export function scanForCards(content: string, index: ScanIndex): CatalogCard[] {
  const text = stripIgnoredRegions(content);
  const found: CatalogCard[] = [];
  const seen = new Set<string>();

  const push = (card: CatalogCard): void => {
    if (!seen.has(card.id)) {
      seen.add(card.id);
      found.push(card);
    }
  };

  // Codes first: they are unambiguous, and a post that carries one usually
  // means that exact printing rather than whatever prose surrounds it.
  for (const raw of text.split(/\s+/u)) {
    const squashed = squashForSearch(raw);
    const card = squashed ? index.byCode.get(squashed) : undefined;
    if (card) {
      push(card);
    }
  }

  const tokens = scanTokens(text);
  let position = 0;
  while (position < tokens.length) {
    let matched = 0;
    for (let length = Math.min(index.maxTokens, tokens.length - position); length > 0; length--) {
      const cards = index.byName.get(tokens.slice(position, position + length).join(" "));
      if (cards) {
        for (const card of cards) {
          push(card);
        }
        matched = length;
        break;
      }
    }
    position += matched || 1;
  }

  return found.slice(0, MAX_SCAN_MATCHES);
}

/**
 * One line of the trade reply: the card, then who offers it and how many.
 * Deliberately plain text rather than a card embed — a want-list post answered
 * with five embeds is worse than the silence it replaced.
 *
 * @returns The line, or null when nobody in the group offers the card.
 */
export function tradeLine(
  card: CatalogCard,
  holders: TradelistHolders | null,
  siteUrl: string,
): string | null {
  if (!holders || holders.holders.length === 0) {
    return null;
  }
  const offers = holders.holders.map(
    (holder) => `${holder.userName ?? "Unknown user"} ${holder.quantity}×`,
  );
  return `**[${card.name}](${siteUrl}/cards/${card.slug})** · ${offers.join(" · ")}`;
}

/**
 * Assembles the reply for a scanned message from the per-card lines. Cards
 * nobody offers contribute nothing, so a message full of names nobody has
 * produces no reply at all — the supply, not the number of name matches, is
 * what decides whether the channel hears from the bot.
 *
 * @returns The message content, or null when there is nothing to say.
 */
export function buildTradeReply(lines: (string | null)[], groupName: string | null): string | null {
  const present = lines.filter((line) => line !== null);
  if (present.length === 0) {
    return null;
  }
  const header = groupName ? `On tradelists in **${groupName}**:` : "On tradelists:";
  return [header, ...present].join("\n");
}
