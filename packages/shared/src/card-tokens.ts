/** A token card the parser can match, keyed by the card it resolves to. */
export interface TokenCardName {
  cardId: string;
  name: string;
}

/**
 * Escape a literal for embedding in a `RegExp` source. Token names are plain
 * today ("Sand Soldier", "XP Tracker"), but they come from the catalog, so a
 * future name with a `.` or `(` must not turn into a wildcard.
 *
 * @returns The input with every regex metacharacter backslash-escaped.
 */
function escapeRegExp(literal: string): string {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * Strip `:rb_*:` glyph markup and collapse whitespace so a reference split
 * across a glyph or a line break still reads as one phrase.
 *
 * @returns The text with glyphs replaced by single spaces.
 */
function flattenCardText(text: string): string {
  return text.replaceAll(/:rb_[a-z0-9_]*:/giu, " ").replaceAll(/\s+/gu, " ");
}

/**
 * Tokens that card text never calls a "token", matched by their own phrasing
 * instead. Both are physical things a player has to bring to the table, so
 * leaving them out would make the section wrong for the decks that need them.
 *
 * Keyed by token-card name rather than id because ids are per-database. A rule
 * whose name matches no token card in the catalog is simply skipped.
 */
const IMPLICIT_TOKEN_RULES: { tokenName: string; pattern: RegExp }[] = [
  // "Buff a friendly unit" places a Buff marker; the reminder text that
  // follows it ("it gets a +1 Might buff") is the same card, so either hits.
  { tokenName: "Buff", pattern: /\bbuffs?\b/iu },
  // "[Level 6]", "6+ XP", "Spend 3 XP" all need something tracking the count.
  // Case-sensitive on purpose: "XP" is an initialism, "xp" is not.
  { tokenName: "XP Tracker", pattern: /\bXP\b|\[Level\b/u },
];

/**
 * Find the token cards a card's rules text tells the player to create.
 *
 * Riftbound writes these as `<TokenCardName> [<cardType>] token`, with the type
 * word optional ("Recruit token" and "Recruit unit token" both occur) and the
 * noun sometimes plural. Anchoring on that trailing `token` is what keeps the
 * short names out of the results: "Gold", "Buff", "Brush" and "Bird" are all
 * ordinary words in card text, and all of them are also token cards.
 *
 * **English only.** The anchor word and the type words are English, so this
 * must never be pointed at a localized printing. That is not a limitation of
 * the result: what gets stored is a card-id relation, which every language
 * then renders through its own printings.
 *
 * A card is never its own token, so `ownerCardId` is dropped from the result.
 * The token cards themselves are what make this necessary: the Buff token's own
 * reminder line is "A unit may have no more than one buff at a time." and the
 * XP Tracker's is "Track gained XP here.", each of which trips its own implicit
 * rule. `card_tokens` refuses such a row (`chk_card_tokens_no_self`), so leaving
 * it in fails the whole write.
 *
 * @returns Ids of the matched token cards, in `tokens` order, deduped.
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
