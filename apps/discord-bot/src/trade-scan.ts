import { foldForSearch, legendDisplayName, squashForSearch } from "@openrift/shared";

import type { CatalogCard, CatalogPrinting } from "./catalog-cache.js";
import type { TradelistHolders } from "./group-tradelists.js";

export const MAX_SCAN_MATCHES = 5;

const MAX_NAME_TOKENS = 8;

const MIN_TOKEN_LENGTH = 3;

export interface ScanIndex {
  byName: Map<string, CatalogCard[]>;
  byCode: Map<string, CatalogCard>;
  maxTokens: number;
}

const IGNORED_REGIONS = [
  /```[\s\S]*?```/gu,
  /`[^`\n]*`/gu,
  /https?:\/\/\S+/gu,
  /<[^>\n]{1,100}>/gu,
  /\[\[[^\n[\]]*\]\]/gu,
  /^>\s.*$/gmu,
];

export function scanTokens(text: string): string[] {
  return foldForSearch(text)
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

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

// Each match becomes a space, not nothing, so removing it can't fuse the words either side.
function stripIgnoredRegions(content: string): string {
  let text = content;
  for (const pattern of IGNORED_REGIONS) {
    text = text.replaceAll(pattern, " ");
  }
  return text;
}

// Matching is exact only, no prefixes or fuzzy distance: a bare "Jinx" must
// not resolve to a card named "Jinx, Rebel".
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

  // Codes first: unambiguous and take precedence over name matches.
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

// Returns plain text, not a card embed.
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
  return `**[${legendDisplayName(card)}](${siteUrl}/cards/${card.slug})** · ${offers.join(" · ")}`;
}

export function buildTradeReply(lines: (string | null)[], groupName: string | null): string | null {
  const present = lines.filter((line) => line !== null);
  if (present.length === 0) {
    return null;
  }
  const header = groupName ? `On tradelists in **${groupName}**:` : "On tradelists:";
  return [header, ...present].join("\n");
}
