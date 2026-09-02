import type { CardResolution, CardSearchIndex, Printing, SearchableCard } from "@openrift/shared";
import {
  buildCardIndex,
  cardSearchAltNames,
  legendDisplayName,
  resolveCard,
} from "@openrift/shared";

import type { ImportEntry } from "@/lib/import-parsers";

export type MatchStatus = "exact" | "needs-review" | "unresolved";

export interface MatchedEntry {
  /** Original parsed entry. */
  entry: ImportEntry;
  /** Match classification. */
  status: MatchStatus;
  /** The resolved printing (set for exact matches, user-selected for needs-review). */
  resolvedPrinting: Printing | null;
  /** Candidate printings when needs-review (multiple printings match the card but not the exact variant). */
  candidates: Printing[];
  /** For name-based matches: the suggested card name. */
  suggestedName?: string;
}

/**
 * Builds a lookup index from the catalog for fast printing resolution.
 * @returns A PrintingIndex for looking up printings by code or name.
 */
function buildPrintingIndex(allPrintings: Printing[]): PrintingIndex {
  return new PrintingIndex(allPrintings);
}

/** One searchable row per card, carrying that card's printings back out. */
interface SearchableCardGroup extends SearchableCard {
  altNames: string[];
  cardName: string;
  printings: Printing[];
}

class PrintingIndex {
  /** shortCode (lowercase) → Printing[] */
  private readonly byShortCode = new Map<string, Printing[]>();
  /**
   * Name resolution, through the app-wide matcher. Replaced a normalized-name
   * map, a "Champion, Title" map and a >70% prefix-overlap guess, all of which
   * this file used to carry and the deck importer used to carry separately.
   */
  private readonly nameIndex: CardSearchIndex<SearchableCardGroup>;
  /** cardId → that card's group, for widening a code hit to the whole card. */
  private readonly byCardId = new Map<string, SearchableCardGroup>();

  constructor(allPrintings: Printing[]) {
    // Index by short code
    for (const printing of allPrintings) {
      const key = printing.shortCode.toLowerCase();
      let group = this.byShortCode.get(key);
      if (!group) {
        group = [];
        this.byShortCode.set(key, group);
      }
      group.push(printing);
    }

    // One searchable row per card, holding every printing of it.
    const byCard = this.byCardId;
    for (const printing of allPrintings) {
      let row = byCard.get(printing.cardId);
      if (!row) {
        row = {
          id: printing.cardId,
          // No slug lookups here, and the id keeps every row distinct.
          slug: printing.cardId,
          name: printing.card.name,
          // Covers the colloquial "Azir, Emperor of the Sands" spelling for a
          // card the catalogue stores as "Emperor of the Sands" tagged "Azir".
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

  /**
   * Resolves a written card name against the catalogue.
   * @returns Matched with one card group, ambiguous with the tied groups, or unmatched.
   */
  resolveName(cardName: string): CardResolution<SearchableCardGroup> {
    return resolveCard(this.nameIndex, cardName);
  }

  /**
   * Looks up printings by short code.
   * Tries exact match first, then tries constructing the code from set prefix + collector number.
   * @returns Matching printings, or an empty array if none found.
   */
  lookupByCode(sourceCode: string): Printing[] {
    // Try the source code directly
    const direct = this.byShortCode.get(sourceCode.toLowerCase());
    if (direct && direct.length > 0) {
      return direct;
    }

    // Try stripping variant suffix (e.g. "OGN-001a" → "OGN-001")
    const baseMatch = sourceCode.match(/^(?<base>[A-Z]{3}-[A-Z0-9]{3})[a-z*]$/iu);
    if (baseMatch) {
      const base = this.byShortCode.get(baseMatch[1].toLowerCase());
      if (base && base.length > 0) {
        return base;
      }
    }

    return [];
  }

  /**
   * Tries to extract a base code from a source code with extra suffixes
   * (e.g. "OGN-249-Release" → "OGN-249") and returns all printings for the
   * same card.
   * @returns All printings for the matched card, or an empty array.
   */
  lookupByBaseCode(sourceCode: string): Printing[] {
    // Try stripping trailing -Suffix segments until we get a hit
    const parts = sourceCode.split("-");
    for (let length = parts.length - 1; length >= 2; length--) {
      const candidate = parts.slice(0, length).join("-").toLowerCase();
      const found = this.byShortCode.get(candidate);
      if (found && found.length > 0) {
        // Found a printing — return all printings for the same card. By card
        // id, not by name: two cards could share a name, and the code already
        // told us exactly which card this is.
        return this.byCardId.get(found[0].cardId)?.printings ?? found;
      }
    }
    return [];
  }
}

/**
 * Matches a list of import entries against the catalog.
 * @returns Matched entries with resolution status.
 */
export function matchEntries(
  entries: ImportEntry[],
  allPrintings: Printing[],
  fallbackLanguage?: string,
): MatchedEntry[] {
  const index = buildPrintingIndex(allPrintings);
  return entries.map((entry) => matchSingleEntry(entry, index, fallbackLanguage));
}

/**
 * If the import entry has a language, filter candidates to that language.
 * Falls back to the full list when no language is specified or no candidates match.
 * @returns The narrowed list, or the original if narrowing would eliminate all candidates.
 */
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

  // Step 1: Look up by short code
  const codeMatches = index.lookupByCode(entry.sourceCode);

  if (codeMatches.length > 0) {
    // Narrow by language first, then by finish
    const langMatches = narrowByLanguage(codeMatches, language);
    const finishMatches = langMatches.filter((printing) => printing.finish === entry.finish);

    // If the entry has a promo slug, match by promo type across language-narrowed matches (finish
    // in the CSV may not reflect the actual finish of the promo printing in the catalog).
    // The export joins multiple markers with "+", so require every listed marker.
    if (entry.promoSlug) {
      const promoSlugs = entry.promoSlug.split("+");
      const promoMatches = langMatches.filter((printing) =>
        promoSlugs.every((slug) => printing.markers.some((m) => m.slug === slug)),
      );
      if (promoMatches.length === 1) {
        return {
          entry,
          status: "exact",
          resolvedPrinting: promoMatches[0],
          candidates: langMatches,
        };
      }
      // Promo slug didn't narrow to one — show language-narrowed matches as ambiguous
      if (promoMatches.length > 1) {
        return {
          entry,
          status: "needs-review",
          resolvedPrinting: null,
          candidates: langMatches,
        };
      }
      // promoSlug didn't match any printing (renamed?) — show as ambiguous, don't auto-resolve to non-promo
      return {
        entry,
        status: "needs-review",
        resolvedPrinting: null,
        candidates: langMatches,
      };
    }

    // If the entry is known to be a promo (e.g. RiftMana's -p suffix) but without a specific slug,
    // prefer promo printings and avoid auto-resolving to the non-promo base
    if (entry.isPromo) {
      const promoMatches = langMatches.filter((printing) => printing.markers.length > 0);
      if (promoMatches.length === 1) {
        return {
          entry,
          status: "exact",
          resolvedPrinting: promoMatches[0],
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

    if (finishMatches.length === 1) {
      // Exact match — include language-narrowed matches as candidates for manual override
      return {
        entry,
        status: "exact",
        resolvedPrinting: finishMatches[0],
        candidates: langMatches,
      };
    }

    if (finishMatches.length > 1) {
      // Prefer the non-promo, non-signed base printing when CSV doesn't distinguish
      const base = finishMatches.filter(
        (printing) => printing.markers.length === 0 && !printing.isSigned,
      );
      if (base.length === 1) {
        return {
          entry,
          status: "exact",
          resolvedPrinting: base[0],
          candidates: langMatches,
        };
      }

      // Multiple printings with same code + finish (e.g., signed vs unsigned)
      return {
        entry,
        status: "needs-review",
        resolvedPrinting: null,
        candidates: finishMatches,
      };
    }

    // No finish match — present language-narrowed matches as candidates
    return {
      entry,
      status: "needs-review",
      resolvedPrinting: null,
      candidates: langMatches,
    };
  }

  // Step 2: Resolve the written card name. Both the stored name and the
  // colloquial "Azir, Emperor of the Sands" form reach the same card. A tie
  // between several cards lists all of their printings as candidates instead of
  // silently picking one.
  const resolution = index.resolveName(entry.cardName);
  if (resolution.status !== "unmatched") {
    const groups = resolution.status === "matched" ? [resolution.card] : resolution.candidates;
    const langMatches = narrowByLanguage(
      groups.flatMap((group) => group.printings),
      language,
    );

    // Try to find the specific printing within the matched card
    const finishMatches = langMatches.filter(
      (printing) => printing.finish === entry.finish && printing.artVariant === entry.artVariant,
    );

    if (finishMatches.length === 1) {
      return {
        entry,
        status: "needs-review",
        resolvedPrinting: finishMatches[0],
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

  // Step 3: Try extracting a base code from suffixed source codes (e.g. "OGN-249-Release" → "OGN-249")
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

  // Step 4: Unresolved
  return {
    entry,
    status: "unresolved",
    resolvedPrinting: null,
    candidates: [],
  };
}
