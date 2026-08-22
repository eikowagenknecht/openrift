import type {
  CardResolution,
  CardSearchIndex,
  CardType,
  DeckZone,
  Domain,
  Printing,
  SearchableCard,
  SuperType,
} from "@openrift/shared";
import {
  buildCardIndex,
  cardSearchAltNames,
  inferZone,
  resolveCard,
  WellKnown,
} from "@openrift/shared";

import type { DeckImportEntry } from "@/lib/deck-import-parsers";

export type DeckMatchStatus = "exact" | "needs-review" | "unresolved";

/** Minimal card info needed for deck import. */
export interface ResolvedCard {
  cardId: string;
  cardName: string;
  cardType: CardType;
  cardTypes: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  /** A representative short code for display. */
  shortCode: string;
  /**
   * The specific printing this entry resolved to, when matched via a
   * printing-specific identifier (short code). Null for name-based matches.
   */
  preferredPrintingId: string | null;
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

/** One searchable row per card, carrying the resolved card back out. */
interface SearchableDeckCard extends SearchableCard {
  altNames: string[];
  resolved: ResolvedCard;
}

/**
 * Builds a lookup index from the catalog for fast card resolution.
 * Groups printings by card to deduplicate — decks care about cards, not specific printings.
 *
 * Name resolution is the app-wide matcher (`@openrift/shared/card-search`), the
 * same one behind every picker. It used to be three hand-rolled lookups here (an
 * exact normalized-name map, a "Tag, Name" map for colloquial Legend spellings,
 * and a >70% prefix-overlap guess), which is how a decklist could import one
 * card in this flow and a different one in the collection flow.
 */
class CardIndex {
  /** shortCode (lowercase) → ResolvedCard. Multiple language printings share a
   * shortCode; we don't pin one because the deck-code formats carry no language
   * info — display falls back to the user's language preference. */
  private byShortCode = new Map<string, ResolvedCard>();
  private nameIndex: CardSearchIndex<SearchableDeckCard>;

  constructor(allPrintings: Printing[]) {
    // Deduplicate printings to cards: pick the first printing per card as representative
    const rows = new Map<string, SearchableDeckCard>();

    for (const printing of allPrintings) {
      const shortCodeKey = printing.shortCode.toLowerCase();
      if (!this.byShortCode.has(shortCodeKey)) {
        this.byShortCode.set(shortCodeKey, cardFromPrinting(printing));
      }

      if (rows.has(printing.cardId)) {
        continue;
      }
      rows.set(printing.cardId, {
        id: printing.cardId,
        // No slug lookups here, and the id keeps every row distinct.
        slug: printing.cardId,
        name: printing.card.name,
        // Covers the colloquial "Sett, The Boss" spelling a source list may use
        // for a card the catalogue stores as "The Boss" tagged "Sett".
        altNames: cardSearchAltNames(printing.card, [printing.printedName]),
        resolved: cardFromPrinting(printing),
      });
    }

    this.nameIndex = buildCardIndex([...rows.values()], new Map());
  }

  /**
   * Looks up a card by short code. Returns a card with `preferredPrintingId: null`
   * because deck-code formats encode card identity, not printing identity — the
   * displayed printing is resolved later via the user's language preference.
   * @returns The resolved card, or null if not found.
   */
  lookupByCode(shortCode: string): ResolvedCard | null {
    return this.byShortCode.get(shortCode.toLowerCase()) ?? null;
  }

  /**
   * Resolves a written card name against the catalogue.
   * @returns Matched with one card, ambiguous with the tied candidates, or unmatched.
   */
  resolveName(cardName: string): CardResolution<SearchableDeckCard> {
    return resolveCard(this.nameIndex, cardName);
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
    cardTypes: printing.card.types,
    superTypes: printing.card.superTypes,
    domains: printing.card.domains,
    shortCode: printing.shortCode,
    preferredPrintingId: null,
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
      ? WellKnown.deckZone.SIDEBOARD
      : entry.sourceSlot === "chosenChampion"
        ? WellKnown.deckZone.CHAMPION
        : WellKnown.deckZone.MAIN;
  }

  return inferZone(card.cardTypes, card.superTypes, entry.sourceSlot);
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
  // already has an explicit champion zone assignment. Skip any entry whose
  // zone was set explicitly by the user (e.g. a "Legend:" text header) —
  // otherwise the promote silently overrides the user's choice and the card
  // lands in Champion even though the import text declared Legend.
  const hasExplicitChampion = matched.some(
    (m) => m.entry.explicitZone === WellKnown.deckZone.CHAMPION,
  );
  if (!hasExplicitChampion) {
    const firstChampion = matched.find(
      (m) =>
        m.resolvedCard?.superTypes.includes(WellKnown.superType.CHAMPION) &&
        m.zone !== WellKnown.deckZone.SIDEBOARD &&
        !m.entry.explicitZone,
    );
    if (firstChampion) {
      firstChampion.zone = WellKnown.deckZone.CHAMPION;
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

  // Strategy 2: Resolve the written card name (text format). One unambiguous
  // best match imports directly; a tie goes to the user rather than being
  // guessed at.
  if (entry.cardName) {
    const resolution = index.resolveName(entry.cardName);
    if (resolution.status === "matched") {
      const card = resolution.card.resolved;
      return {
        entry,
        status: "exact",
        resolvedCard: card,
        candidates: [card],
        zone: inferEntryZone(entry, card),
      };
    }
    if (resolution.status === "ambiguous") {
      const candidates = resolution.candidates.map((row) => row.resolved);
      // The first candidate seeds the row's dropdown, but the status keeps the
      // entry in the review list until the importer confirms or changes it.
      const first = candidates[0] as ResolvedCard;
      return {
        entry,
        status: "needs-review",
        resolvedCard: first,
        candidates,
        suggestedName: first.cardName,
        zone: inferEntryZone(entry, first),
      };
    }
  }

  // Strategy 3: Unresolved
  return {
    entry,
    status: "unresolved",
    resolvedCard: null,
    candidates: [],
    zone: inferEntryZone(entry, null),
  };
}
