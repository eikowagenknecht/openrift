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
    // Filter by finish
    const finishMatches = codeMatches.filter((printing) => printing.finish === entry.finish);

    if (finishMatches.length === 1) {
      // Exact match
      return {
        entry,
        status: "exact",
        resolvedPrinting: finishMatches[0],
        candidates: [],
      };
    }

    if (finishMatches.length > 1) {
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
        candidates: finishMatches,
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

  // Step 3: Unresolved
  return {
    entry,
    status: "unresolved",
    resolvedPrinting: null,
    candidates: [],
  };
}
