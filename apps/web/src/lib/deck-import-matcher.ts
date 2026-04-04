import type { CardType, DeckZone, Domain, Printing, SuperType } from "@openrift/shared";
import { inferZone, normalizeNameForMatching } from "@openrift/shared";

import type { DeckImportEntry } from "@/lib/deck-import-parsers";

export type DeckMatchStatus = "exact" | "ambiguous" | "fuzzy" | "unresolved";

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
  /** The resolved card (set for exact matches, user-selected for ambiguous/fuzzy). */
  resolvedCard: ResolvedCard | null;
  /** Candidate cards when ambiguous or for manual override. */
  candidates: ResolvedCard[];
  /** For fuzzy matches: the suggested card name. */
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
  /** All unique resolved cards for iteration during fuzzy search. */
  private allCards: ResolvedCard[] = [];

  constructor(allPrintings: Printing[]) {
    // Deduplicate printings to cards: pick the first printing per card as representative
    const cardMap = new Map<string, ResolvedCard>();

    for (const printing of allPrintings) {
      if (cardMap.has(printing.card.id)) {
        // Still index additional short codes for this card
        const existing = cardMap.get(printing.card.id);
        if (existing) {
          this.byShortCode.set(printing.shortCode.toLowerCase(), existing);
        }
        continue;
      }

      const resolved = cardFromPrinting(printing);
      cardMap.set(printing.card.id, resolved);
      this.byShortCode.set(printing.shortCode.toLowerCase(), resolved);
    }

    this.allCards = [...cardMap.values()];

    for (const card of this.allCards) {
      const normalized = normalizeNameForMatching(card.cardName);
      if (normalized.length > 0) {
        this.byNormalizedName.set(normalized, card);
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
    cardId: printing.card.id,
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
  return entries.map((entry) => matchSingleDeckEntry(entry, index));
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

    // Strategy 3: Fuzzy name match
    const fuzzy = index.fuzzyMatchByName(entry.cardName);
    if (fuzzy) {
      return {
        entry,
        status: "fuzzy",
        resolvedCard: fuzzy.card,
        candidates: [fuzzy.card],
        suggestedName: fuzzy.matchedName,
        zone: inferEntryZone(entry, fuzzy.card),
      };
    }
  }

  // Strategy 4: Unresolved
  return {
    entry,
    status: "unresolved",
    resolvedCard: null,
    candidates: [],
    zone: inferEntryZone(entry, null),
  };
}
