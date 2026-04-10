import type { CardType, DeckZone, Domain, Printing, SuperType } from "@openrift/shared";
import { WellKnown, inferZone, normalizeNameForMatching } from "@openrift/shared";

import type { DeckImportEntry } from "@/lib/deck-import-parsers";

export type DeckMatchStatus = "exact" | "needs-review" | "unresolved";

/** Minimal card info needed for deck import. */
export interface ResolvedCard {
  cardId: string;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  /** A representative short code for display. */
  shortCode: string;
}

export interface DeckMatchedEntry {
  /** Original parsed entry. */
  entry: DeckImportEntry;
  /** Match classification. */
  status: DeckMatchStatus;
  /** The resolved card (set for exact matches, user-selected for needs-review). */
  resolvedCard: ResolvedCard | null;
  /** Candidate cards when needs-review or for manual override. */
  candidates: ResolvedCard[];
  /** For name-based matches: the suggested card name. */
  suggestedName?: string;
  /** Inferred or explicit deck zone. */
  zone: DeckZone;
}

/**
 * Builds a lookup index from the catalog for fast card resolution.
 * Groups printings by card to deduplicate — decks care about cards, not specific printings.
 */
class CardIndex {
  /** shortCode (lowercase) → ResolvedCard */
  private byShortCode = new Map<string, ResolvedCard>();
  /** normalized card name → ResolvedCard */
  private byNormalizedName = new Map<string, ResolvedCard>();
  /** "normalizedTag:normalizedName" → ResolvedCard (for "Character, Title" lookups) */
  private byTagAndName = new Map<string, ResolvedCard>();
  /** All unique resolved cards for iteration during fuzzy search. */
  private allCards: ResolvedCard[] = [];

  constructor(allPrintings: Printing[]) {
    // Deduplicate printings to cards: pick the first printing per card as representative
    const cardMap = new Map<string, { resolved: ResolvedCard; tags: string[] }>();

    for (const printing of allPrintings) {
      if (cardMap.has(printing.cardId)) {
        // Still index additional short codes for this card
        const existing = cardMap.get(printing.cardId);
        if (existing) {
          this.byShortCode.set(printing.shortCode.toLowerCase(), existing.resolved);
        }
        continue;
      }

      const resolved = cardFromPrinting(printing);
      cardMap.set(printing.cardId, { resolved, tags: printing.card.tags });
      this.byShortCode.set(printing.shortCode.toLowerCase(), resolved);
    }

    this.allCards = [...cardMap.values()].map((entry) => entry.resolved);

    for (const { resolved, tags } of cardMap.values()) {
      const normalized = normalizeNameForMatching(resolved.cardName);
      if (normalized.length > 0) {
        this.byNormalizedName.set(normalized, resolved);
      }

      // Index each tag + card name combination for "Character, Title" lookups
      for (const tag of tags) {
        const normalizedTag = normalizeNameForMatching(tag);
        if (normalizedTag.length > 0 && normalized.length > 0) {
          this.byTagAndName.set(`${normalizedTag}:${normalized}`, resolved);
        }
      }
    }
  }

  /**
   * Looks up a card by short code.
   * @returns The resolved card, or null if not found.
   */
  lookupByCode(shortCode: string): ResolvedCard | null {
    return this.byShortCode.get(shortCode.toLowerCase()) ?? null;
  }

  /**
   * Looks up a card by exact normalized name.
   * @returns The resolved card, or null if not found.
   */
  lookupByName(cardName: string): ResolvedCard | null {
    const normalized = normalizeNameForMatching(cardName);
    if (normalized.length === 0) {
      return null;
    }
    return this.byNormalizedName.get(normalized) ?? null;
  }

  /**
   * Looks up a card by splitting "Tag, Name" and matching tag + card name.
   * Handles import formats like "Sett, The Boss" where DB stores name "The Boss" with tag "Sett".
   * @returns The resolved card, or null if not found.
   */
  lookupByTagAndName(cardName: string): ResolvedCard | null {
    const commaIndex = cardName.indexOf(",");
    if (commaIndex === -1) {
      return null;
    }
    const tag = normalizeNameForMatching(cardName.slice(0, commaIndex));
    const name = normalizeNameForMatching(cardName.slice(commaIndex + 1));
    if (tag.length === 0 || name.length === 0) {
      return null;
    }
    return this.byTagAndName.get(`${tag}:${name}`) ?? null;
  }

  /**
   * Fuzzy search by card name. Returns the best match if close enough (>70% similarity).
   * @returns The best matching card and its name, or null.
   */
  fuzzyMatchByName(cardName: string): { card: ResolvedCard; matchedName: string } | null {
    const normalized = normalizeNameForMatching(cardName);
    if (normalized.length === 0) {
      return null;
    }

    // Exact normalized match
    const exact = this.byNormalizedName.get(normalized);
    if (exact) {
      return { card: exact, matchedName: exact.cardName };
    }

    // Prefix/substring match with similarity threshold
    let bestMatch: ResolvedCard | null = null;
    let bestScore = 0;

    for (const [key, card] of this.byNormalizedName) {
      if (key.startsWith(normalized) || normalized.startsWith(key)) {
        const shorter = Math.min(key.length, normalized.length);
        const longer = Math.max(key.length, normalized.length);
        const score = shorter / longer;
        if (score > bestScore && score > 0.7) {
          bestScore = score;
          bestMatch = card;
        }
      }
    }

    if (bestMatch) {
      return { card: bestMatch, matchedName: bestMatch.cardName };
    }

    return null;
  }

  /**
   * Search cards by query string (for the correction search UI).
   * @returns Up to `limit` matching cards.
   */
  search(query: string, limit: number): ResolvedCard[] {
    const lower = query.toLowerCase();
    const results: ResolvedCard[] = [];

    for (const card of this.allCards) {
      if (
        card.cardName.toLowerCase().includes(lower) ||
        card.shortCode.toLowerCase().includes(lower)
      ) {
        results.push(card);
        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
  }
}

/**
 * Creates a ResolvedCard from a Printing.
 * @returns A ResolvedCard with card-level information.
 */
function cardFromPrinting(printing: Printing): ResolvedCard {
  return {
    cardId: printing.cardId,
    cardName: printing.card.name,
    cardType: printing.card.type,
    superTypes: printing.card.superTypes,
    domains: printing.card.domains,
    shortCode: printing.shortCode,
  };
}

/**
 * Infers the deck zone for an entry based on the resolved card and source slot.
 * @returns The inferred DeckZone.
 */
function inferEntryZone(entry: DeckImportEntry, card: ResolvedCard | null): DeckZone {
  if (entry.explicitZone) {
    return entry.explicitZone;
  }
  if (!card) {
    return entry.sourceSlot === "sideboard"
      ? "sideboard"
      : entry.sourceSlot === "chosenChampion"
        ? "champion"
        : "main";
  }

  return inferZone(card.cardType, card.superTypes, entry.sourceSlot);
}

/**
 * Matches a list of deck import entries against the catalog.
 * @returns Matched entries with resolution status and inferred zones.
 */
export function matchDeckEntries(
  entries: DeckImportEntry[],
  allPrintings: Printing[],
): DeckMatchedEntry[] {
  const index = new CardIndex(allPrintings);
  const matched = entries.map((entry) => matchSingleDeckEntry(entry, index));

  // Auto-assign the first Champion card to the champion zone when no entry
  // already has an explicit champion zone assignment.
  const hasExplicitChampion = matched.some((m) => m.entry.explicitZone === "champion");
  if (!hasExplicitChampion) {
    const firstChampion = matched.find(
      (m) =>
        m.resolvedCard?.superTypes.includes(WellKnown.superType.CHAMPION) && m.zone !== "sideboard",
    );
    if (firstChampion) {
      firstChampion.zone = "champion";
      if (firstChampion.entry.quantity > 1) {
        // Split: 1 copy goes to champion zone, rest stay in main
        const originalEntry = firstChampion.entry;
        const remainingQuantity = originalEntry.quantity - 1;
        firstChampion.entry = { ...originalEntry, quantity: 1 };
        const remainingEntry = {
          ...originalEntry,
          quantity: remainingQuantity,
          explicitZone: undefined,
        };
        matched.splice(matched.indexOf(firstChampion) + 1, 0, {
          entry: remainingEntry,
          status: firstChampion.status,
          resolvedCard: firstChampion.resolvedCard,
          candidates: firstChampion.candidates,
          suggestedName: firstChampion.suggestedName,
          zone: inferEntryZone(remainingEntry, firstChampion.resolvedCard),
        });
      }
    }
  }

  return matched;
}

function matchSingleDeckEntry(entry: DeckImportEntry, index: CardIndex): DeckMatchedEntry {
  // Strategy 1: Look up by short code (Piltover / TTS formats)
  if (entry.shortCode) {
    const card = index.lookupByCode(entry.shortCode);
    if (card) {
      return {
        entry,
        status: "exact",
        resolvedCard: card,
        candidates: [card],
        zone: inferEntryZone(entry, card),
      };
    }

    // Short code not found — try fuzzy name match if we have a card name
    // (shouldn't happen for Piltover/TTS, but just in case)
  }

  // Strategy 2: Look up by exact card name (text format)
  if (entry.cardName) {
    const card = index.lookupByName(entry.cardName);
    if (card) {
      return {
        entry,
        status: "exact",
        resolvedCard: card,
        candidates: [card],
        zone: inferEntryZone(entry, card),
      };
    }

    // Strategy 3: Tag + name match (e.g. "Sett, The Boss" → tag "Sett" + name "The Boss")
    const tagMatch = index.lookupByTagAndName(entry.cardName);
    if (tagMatch) {
      return {
        entry,
        status: "exact",
        resolvedCard: tagMatch,
        candidates: [tagMatch],
        zone: inferEntryZone(entry, tagMatch),
      };
    }

    // Strategy 4: Fuzzy name match
    const fuzzy = index.fuzzyMatchByName(entry.cardName);
    if (fuzzy) {
      return {
        entry,
        status: "needs-review",
        resolvedCard: fuzzy.card,
        candidates: [fuzzy.card],
        suggestedName: fuzzy.matchedName,
        zone: inferEntryZone(entry, fuzzy.card),
      };
    }
  }

  // Strategy 5: Unresolved
  return {
    entry,
    status: "unresolved",
    resolvedCard: null,
    candidates: [],
    zone: inferEntryZone(entry, null),
  };
}
