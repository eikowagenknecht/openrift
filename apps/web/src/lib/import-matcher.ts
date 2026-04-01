import type { Printing } from "@openrift/shared";
import { normalizeNameForMatching } from "@openrift/shared";

import type { ImportEntry } from "@/lib/import-parsers";

export type MatchStatus = "exact" | "ambiguous" | "fuzzy" | "unresolved";

export interface MatchedEntry {
  /** Original parsed entry. */
  entry: ImportEntry;
  /** Match classification. */
  status: MatchStatus;
  /** The resolved printing (set for exact matches, user-selected for ambiguous/fuzzy). */
  resolvedPrinting: Printing | null;
  /** Candidate printings when ambiguous (multiple printings match the card but not the exact variant). */
  candidates: Printing[];
  /** For fuzzy matches: the suggested card name. */
  suggestedName?: string;
}

/**
 * Builds a lookup index from the catalog for fast printing resolution.
 * @returns A PrintingIndex for looking up printings by code or name.
 */
function buildPrintingIndex(allPrintings: Printing[]): PrintingIndex {
  return new PrintingIndex(allPrintings);
}

class PrintingIndex {
  /** shortCode (lowercase) → Printing[] */
  private byShortCode = new Map<string, Printing[]>();
  /** normalized card name → { cardId, cardName, printings } */
  private byNormalizedName = new Map<string, { cardName: string; printings: Printing[] }>();

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

    // Index by normalized card name
    for (const printing of allPrintings) {
      const normalizedName = normalizeNameForMatching(printing.card.name);
      let group = this.byNormalizedName.get(normalizedName);
      if (!group) {
        group = { cardName: printing.card.name, printings: [] };
        this.byNormalizedName.set(normalizedName, group);
      }
      group.printings.push(printing);
    }
  }

  /**
   * Looks up printings by short code.
   * Tries exact match first, then tries constructing the code from set prefix + collector number.
   * @returns Matching printings, or an empty array if none found.
   */
  lookupByCode(sourceCode: string, setPrefix: string, collectorNumber: number): Printing[] {
    // Try the source code directly
    const direct = this.byShortCode.get(sourceCode.toLowerCase());
    if (direct && direct.length > 0) {
      return direct;
    }

    // Try constructing the code with zero-padded number
    const padded = `${setPrefix}-${String(collectorNumber).padStart(3, "0")}`.toLowerCase();
    if (padded !== sourceCode.toLowerCase()) {
      const constructed = this.byShortCode.get(padded);
      if (constructed && constructed.length > 0) {
        return constructed;
      }
    }

    return [];
  }

  /**
   * Fuzzy search by card name. Returns the best match if the name is close enough.
   * @returns The best matching card group, or null if no close match found.
   */
  fuzzyMatchByName(cardName: string): { cardName: string; printings: Printing[] } | null {
    const normalized = normalizeNameForMatching(cardName);
    if (normalized.length === 0) {
      return null;
    }

    // Exact normalized name match
    const exact = this.byNormalizedName.get(normalized);
    if (exact) {
      return exact;
    }

    // Prefix/substring match — find the best one
    let bestMatch: { cardName: string; printings: Printing[] } | null = null;
    let bestScore = 0;

    for (const [key, group] of this.byNormalizedName) {
      if (key.startsWith(normalized) || normalized.startsWith(key)) {
        // Overlap ratio as a simple similarity score
        const shorter = Math.min(key.length, normalized.length);
        const longer = Math.max(key.length, normalized.length);
        const score = shorter / longer;
        if (score > bestScore && score > 0.7) {
          bestScore = score;
          bestMatch = group;
        }
      }
    }

    return bestMatch;
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
        // Found a printing — return all printings for the same card
        const cardName = normalizeNameForMatching(found[0].card.name);
        const cardGroup = this.byNormalizedName.get(cardName);
        return cardGroup?.printings ?? found;
      }
    }
    return [];
  }
}

/**
 * Matches a list of import entries against the catalog.
 * @returns Matched entries with resolution status.
 */
export function matchEntries(entries: ImportEntry[], allPrintings: Printing[]): MatchedEntry[] {
  const index = buildPrintingIndex(allPrintings);
  return entries.map((entry) => matchSingleEntry(entry, index));
}

function matchSingleEntry(entry: ImportEntry, index: PrintingIndex): MatchedEntry {
  // Step 1: Look up by short code
  const codeMatches = index.lookupByCode(entry.sourceCode, entry.setPrefix, entry.collectorNumber);

  if (codeMatches.length > 0) {
    // Narrow by finish
    const finishMatches = codeMatches.filter((printing) => printing.finish === entry.finish);

    // If the entry has a promo slug, match by promo type across ALL code matches (finish in
    // the CSV may not reflect the actual finish of the promo printing in the catalog)
    if (entry.promoSlug) {
      const promoMatches = codeMatches.filter(
        (printing) => printing.promoType?.slug === entry.promoSlug,
      );
      if (promoMatches.length === 1) {
        return {
          entry,
          status: "exact",
          resolvedPrinting: promoMatches[0],
          candidates: codeMatches,
        };
      }
      // Promo slug didn't narrow to one — show all code matches as ambiguous
      if (promoMatches.length > 1) {
        return {
          entry,
          status: "ambiguous",
          resolvedPrinting: null,
          candidates: codeMatches,
        };
      }
      // promoSlug didn't match any printing (renamed?) — show as ambiguous, don't auto-resolve to non-promo
      return {
        entry,
        status: "ambiguous",
        resolvedPrinting: null,
        candidates: codeMatches,
      };
    }

    if (finishMatches.length === 1) {
      // Exact match — include all code matches as candidates for manual override
      return {
        entry,
        status: "exact",
        resolvedPrinting: finishMatches[0],
        candidates: codeMatches,
      };
    }

    if (finishMatches.length > 1) {
      // Prefer the non-promo, non-signed base printing when CSV doesn't distinguish
      const base = finishMatches.filter((printing) => !printing.promoType && !printing.isSigned);
      if (base.length === 1) {
        return {
          entry,
          status: "exact",
          resolvedPrinting: base[0],
          candidates: codeMatches,
        };
      }

      // Multiple printings with same code + finish (e.g., signed vs unsigned)
      return {
        entry,
        status: "ambiguous",
        resolvedPrinting: null,
        candidates: finishMatches,
      };
    }

    // No finish match — present all code matches as candidates
    return {
      entry,
      status: "ambiguous",
      resolvedPrinting: null,
      candidates: codeMatches,
    };
  }

  // Step 2: Try fuzzy name match
  const fuzzy = index.fuzzyMatchByName(entry.cardName);
  if (fuzzy) {
    // Try to find the specific printing within the fuzzy match
    const finishMatches = fuzzy.printings.filter(
      (printing) => printing.finish === entry.finish && printing.artVariant === entry.artVariant,
    );

    if (finishMatches.length === 1) {
      return {
        entry,
        status: "fuzzy",
        resolvedPrinting: finishMatches[0],
        candidates: fuzzy.printings,
        suggestedName: fuzzy.cardName,
      };
    }

    return {
      entry,
      status: "fuzzy",
      resolvedPrinting: null,
      candidates: fuzzy.printings,
      suggestedName: fuzzy.cardName,
    };
  }

  // Step 3: Try extracting a base code from suffixed source codes (e.g. "OGN-249-Release" → "OGN-249")
  const baseCodeMatches = index.lookupByBaseCode(entry.sourceCode);
  if (baseCodeMatches.length > 0) {
    return {
      entry,
      status: "ambiguous",
      resolvedPrinting: null,
      candidates: baseCodeMatches,
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
