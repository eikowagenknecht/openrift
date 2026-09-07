export interface TokenCardName {
  cardId: string;
  name: string;
}

function escapeRegExp(literal: string): string {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function flattenCardText(text: string): string {
  return text.replaceAll(/:rb_[a-z0-9_]*:/giu, " ").replaceAll(/\s+/gu, " ");
}

/** Keyed by name: ids are per-database. A name matching no catalog card is skipped. */
const IMPLICIT_TOKEN_RULES: { tokenName: string; pattern: RegExp }[] = [
  { tokenName: "Buff", pattern: /\bbuffs?\b/iu },
  // Case-sensitive on purpose: "XP" is an initialism, "xp" is not.
  { tokenName: "XP Tracker", pattern: /\bXP\b|\[Level\b/u },
];

/**
 * Must never be pointed at a localized printing: the anchor word and type words are English.
 * `card_tokens` rejects a self-reference row (`chk_card_tokens_no_self`); `ownerCardId` is dropped from the result.
 */
export function findTokenReferences(
  texts: (string | null | undefined)[],
  tokens: TokenCardName[],
  cardTypeSlugs: string[],
  ownerCardId: string,
): string[] {
  const present = texts.filter((text): text is string => Boolean(text));
  if (present.length === 0 || tokens.length === 0) {
    return [];
  }

  // Longest first, so a name that is a prefix of another ("Bird" vs a future
  // "Bird of Prey") cannot shadow the longer match.
  const byLength = tokens.toSorted((a, b) => b.name.length - a.name.length);
  const namePattern = byLength.map((token) => escapeRegExp(token.name)).join("|");
  const typePattern = cardTypeSlugs.map((slug) => escapeRegExp(slug)).join("|");

  // The type word is optional but, when present, must be a real card type —
  // otherwise "Gold from the token pool" would read as a Gold reference.
  const typeGroup = typePattern ? String.raw`(?:\s+(?:${typePattern}))?` : "";
  const pattern = new RegExp(String.raw`\b(${namePattern})\b${typeGroup}\s+tokens?\b`, "giu");

  const cardIdByName = new Map(tokens.map((token) => [token.name.toLowerCase(), token.cardId]));
  const flattened = present.map((text) => flattenCardText(text));
  const matched = new Set<string>();

  for (const text of flattened) {
    for (const match of text.matchAll(pattern)) {
      const cardId = cardIdByName.get(match[1].toLowerCase());
      if (cardId) {
        matched.add(cardId);
      }
    }
  }

  for (const rule of IMPLICIT_TOKEN_RULES) {
    const cardId = cardIdByName.get(rule.tokenName.toLowerCase());
    if (cardId && flattened.some((text) => rule.pattern.test(text))) {
      matched.add(cardId);
    }
  }

  return tokens
    .filter((token) => matched.has(token.cardId) && token.cardId !== ownerCardId)
    .map((token) => token.cardId);
}
