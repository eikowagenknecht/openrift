import type { CardResolution, CardSearchIndex, SearchableCard } from "@openrift/shared/card-search";
import { buildCardIndex, resolveCard } from "@openrift/shared/card-search";
import type { Printing } from "@openrift/shared/types/catalog";
import type { CardType, DeckZone, Domain, SuperType } from "@openrift/shared/types/enums";
import { cardSearchAltNames, legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { inferZone } from "@openrift/shared/zone-inference";

import type { DeckImportEntry } from "@/features/decks/lib/deck-import-parsers";

export type DeckMatchStatus = "exact" | "needs-review" | "unresolved";

export interface ResolvedCard {
  cardId: string;
  cardName: string;
  cardType: CardType;
  cardTypes: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  shortCode: string;
  preferredPrintingId: string | null;
}

export interface DeckMatchedEntry {
  entry: DeckImportEntry;
  status: DeckMatchStatus;
  resolvedCard: ResolvedCard | null;
  candidates: ResolvedCard[];
  suggestedName?: string;
  zone: DeckZone;
}

interface SearchableDeckCard extends SearchableCard {
  altNames: string[];
  resolved: ResolvedCard;
}

class CardIndex {
  private readonly byShortCode = new Map<string, ResolvedCard>();
  private readonly nameIndex: CardSearchIndex<SearchableDeckCard>;

  constructor(allPrintings: Printing[]) {
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
        slug: printing.cardId,
        name: printing.card.name,
        // Covers a colloquial "Sett, The Boss" spelling for a card the
        // catalogue stores as "The Boss" tagged "Sett".
        altNames: cardSearchAltNames(printing.card, [printing.printedName]),
        resolved: cardFromPrinting(printing),
      });
    }

    this.nameIndex = buildCardIndex([...rows.values()], new Map());
  }

  /** `preferredPrintingId` is always null: deck-code formats encode card identity, not printing identity. */
  lookupByCode(shortCode: string): ResolvedCard | null {
    return this.byShortCode.get(shortCode.toLowerCase()) ?? null;
  }

  resolveName(cardName: string): CardResolution<SearchableDeckCard> {
    return resolveCard(this.nameIndex, cardName);
  }
}

function cardFromPrinting(printing: Printing): ResolvedCard {
  return {
    cardId: printing.cardId,
    cardName: legendDisplayName(printing.card),
    cardType: printing.card.type,
    cardTypes: printing.card.types,
    superTypes: printing.card.superTypes,
    domains: printing.card.domains,
    shortCode: printing.shortCode,
    preferredPrintingId: null,
  };
}

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

export function matchDeckEntries(
  entries: DeckImportEntry[],
  allPrintings: Printing[],
): DeckMatchedEntry[] {
  const index = new CardIndex(allPrintings);
  const matched = entries.map((entry) => matchSingleDeckEntry(entry, index));

  // Skip entries with an explicit zone (e.g. a "Legend:" header): promoting
  // one would silently override the user's own zone choice.
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
  }

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

  return {
    entry,
    status: "unresolved",
    resolvedCard: null,
    candidates: [],
    zone: inferEntryZone(entry, null),
  };
}
