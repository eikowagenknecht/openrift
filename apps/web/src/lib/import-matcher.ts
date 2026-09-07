import type { CardResolution, CardSearchIndex, Printing, SearchableCard } from "@openrift/shared";
import {
  buildCardIndex,
  cardSearchAltNames,
  legendDisplayName,
  resolveCard,
} from "@openrift/shared";

import type { ImportEntry } from "@/lib/import-parsers";

function onlyOne<Item>(items: readonly Item[]): Item | undefined {
  return items.length === 1 ? items[0] : undefined;
}

export type MatchStatus = "exact" | "needs-review" | "unresolved";

export interface MatchedEntry {
  entry: ImportEntry;
  status: MatchStatus;
  resolvedPrinting: Printing | null;
  candidates: Printing[];
  suggestedName?: string;
}

function buildPrintingIndex(allPrintings: Printing[]): PrintingIndex {
  return new PrintingIndex(allPrintings);
}

interface SearchableCardGroup extends SearchableCard {
  altNames: string[];
  cardName: string;
  printings: Printing[];
}

class PrintingIndex {
  private readonly byShortCode = new Map<string, Printing[]>();
  private readonly nameIndex: CardSearchIndex<SearchableCardGroup>;
  private readonly byCardId = new Map<string, SearchableCardGroup>();

  constructor(allPrintings: Printing[]) {
    for (const printing of allPrintings) {
      const key = printing.shortCode.toLowerCase();
      let group = this.byShortCode.get(key);
      if (!group) {
        group = [];
        this.byShortCode.set(key, group);
      }
      group.push(printing);
    }

    const byCard = this.byCardId;
    for (const printing of allPrintings) {
      let row = byCard.get(printing.cardId);
      if (!row) {
        row = {
          id: printing.cardId,
          slug: printing.cardId,
          name: printing.card.name,
          altNames: cardSearchAltNames(printing.card),
          cardName: legendDisplayName(printing.card),
          printings: [],
        };
        byCard.set(printing.cardId, row);
      }
      row.printings.push(printing);
      if (printing.printedName && !row.altNames.includes(printing.printedName)) {
        row.altNames.push(printing.printedName);
      }
    }
    this.nameIndex = buildCardIndex([...byCard.values()], new Map());
  }

  resolveName(cardName: string): CardResolution<SearchableCardGroup> {
    return resolveCard(this.nameIndex, cardName);
  }

  lookupByCode(sourceCode: string): Printing[] {
    const direct = this.byShortCode.get(sourceCode.toLowerCase());
    if (direct && direct.length > 0) {
      return direct;
    }

    // e.g. "OGN-001a" → "OGN-001"
    const baseMatch = /^(?<base>[A-Z]{3}-[A-Z0-9]{3})[a-z*]$/iu.exec(sourceCode);
    const basePrefix = baseMatch?.[1];
    if (basePrefix !== undefined) {
      const base = this.byShortCode.get(basePrefix.toLowerCase());
      if (base && base.length > 0) {
        return base;
      }
    }

    return [];
  }

  /** e.g. "OGN-249-Release" → "OGN-249", returning all printings of that card. */
  lookupByBaseCode(sourceCode: string): Printing[] {
    const parts = sourceCode.split("-");
    for (let length = parts.length - 1; length >= 2; length--) {
      const candidate = parts.slice(0, length).join("-").toLowerCase();
      const found = this.byShortCode.get(candidate);
      const firstFound = found?.[0];
      if (found && firstFound) {
        // By card id, not name: two cards can share a name, but the code already picked this one.
        return this.byCardId.get(firstFound.cardId)?.printings ?? found;
      }
    }
    return [];
  }
}

export function matchEntries(
  entries: ImportEntry[],
  allPrintings: Printing[],
  fallbackLanguage?: string,
): MatchedEntry[] {
  const index = buildPrintingIndex(allPrintings);
  return entries.map((entry) => matchSingleEntry(entry, index, fallbackLanguage));
}

function narrowByLanguage(candidates: Printing[], language?: string): Printing[] {
  if (!language || candidates.length === 0) {
    return candidates;
  }
  const filtered = candidates.filter((printing) => printing.language === language);
  return filtered.length > 0 ? filtered : candidates;
}

function matchSingleEntry(
  entry: ImportEntry,
  index: PrintingIndex,
  fallbackLanguage?: string,
): MatchedEntry {
  const language = entry.language ?? fallbackLanguage;

  const codeMatches = index.lookupByCode(entry.sourceCode);

  if (codeMatches.length > 0) {
    const langMatches = narrowByLanguage(codeMatches, language);
    const finishMatches = langMatches.filter((printing) => printing.finish === entry.finish);

    // Finish in the CSV may not reflect the promo printing's actual finish, so promo
    // slug is matched separately. Multiple markers are joined with "+"; all must match.
    if (entry.promoSlug) {
      const promoSlugs = entry.promoSlug.split("+");
      const promoMatches = langMatches.filter((printing) =>
        promoSlugs.every((slug) => printing.markers.some((m) => m.slug === slug)),
      );
      const onlyPromoMatch = onlyOne(promoMatches);
      if (onlyPromoMatch) {
        return {
          entry,
          status: "exact",
          resolvedPrinting: onlyPromoMatch,
          candidates: langMatches,
        };
      }
      if (promoMatches.length > 1) {
        return {
          entry,
          status: "needs-review",
          resolvedPrinting: null,
          candidates: langMatches,
        };
      }
      // No matching promo printing (possibly renamed): don't auto-resolve to the non-promo base.
      return {
        entry,
        status: "needs-review",
        resolvedPrinting: null,
        candidates: langMatches,
      };
    }

    // Known promo without a specific slug (e.g. RiftMana's -p suffix): don't auto-resolve to the base.
    if (entry.isPromo) {
      const promoMatches = langMatches.filter((printing) => printing.markers.length > 0);
      const onlyPromoMatch = onlyOne(promoMatches);
      if (onlyPromoMatch) {
        return {
          entry,
          status: "exact",
          resolvedPrinting: onlyPromoMatch,
          candidates: langMatches,
        };
      }
      return {
        entry,
        status: "needs-review",
        resolvedPrinting: null,
        candidates: promoMatches.length > 0 ? promoMatches : langMatches,
      };
    }

    const onlyFinishMatch = onlyOne(finishMatches);
    if (onlyFinishMatch) {
      return {
        entry,
        status: "exact",
        resolvedPrinting: onlyFinishMatch,
        candidates: langMatches,
      };
    }

    if (finishMatches.length > 1) {
      // CSV doesn't distinguish signed/promo variants, so prefer the plain base printing.
      const base = finishMatches.filter(
        (printing) => printing.markers.length === 0 && !printing.isSigned,
      );
      const onlyBase = onlyOne(base);
      if (onlyBase) {
        return {
          entry,
          status: "exact",
          resolvedPrinting: onlyBase,
          candidates: langMatches,
        };
      }

      return {
        entry,
        status: "needs-review",
        resolvedPrinting: null,
        candidates: finishMatches,
      };
    }

    return {
      entry,
      status: "needs-review",
      resolvedPrinting: null,
      candidates: langMatches,
    };
  }

  const resolution = index.resolveName(entry.cardName);
  if (resolution.status !== "unmatched") {
    const groups = resolution.status === "matched" ? [resolution.card] : resolution.candidates;
    const langMatches = narrowByLanguage(
      groups.flatMap((group) => group.printings),
      language,
    );

    const finishMatches = langMatches.filter(
      (printing) =>
        printing.finish === entry.finish &&
        printing.artVariant === entry.artVariant &&
        (entry.isOvernumbered === undefined || printing.isOvernumbered === entry.isOvernumbered),
    );

    const onlyFinishMatch = onlyOne(finishMatches);
    if (onlyFinishMatch) {
      return {
        entry,
        status: "needs-review",
        resolvedPrinting: onlyFinishMatch,
        candidates: langMatches,
        suggestedName: groups[0]?.cardName,
      };
    }

    return {
      entry,
      status: "needs-review",
      resolvedPrinting: null,
      candidates: langMatches,
      suggestedName: groups[0]?.cardName,
    };
  }

  const baseCodeMatches = index.lookupByBaseCode(entry.sourceCode);
  if (baseCodeMatches.length > 0) {
    const langMatches = narrowByLanguage(baseCodeMatches, language);
    return {
      entry,
      status: "needs-review",
      resolvedPrinting: null,
      candidates: langMatches,
    };
  }

  return {
    entry,
    status: "unresolved",
    resolvedPrinting: null,
    candidates: [],
  };
}
