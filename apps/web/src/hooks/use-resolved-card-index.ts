import type { Printing } from "@openrift/shared/types/catalog";
import { cardSearchAltNames, legendDisplayName } from "@openrift/shared/utils";
import { useMemo } from "react";

import type { ResolvedCard } from "@/lib/deck-import-matcher";

/** Deduplicates the catalog to one {@link ResolvedCard} per card, keeping each card's first printing as its representative. */
export function useResolvedCardIndex(allPrintings: Printing[]) {
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const results: {
      id: string;
      slug: string;
      name: string;
      altNames: string[];
      card: ResolvedCard;
    }[] = [];
    for (const printing of allPrintings) {
      if (seen.has(printing.cardId)) {
        continue;
      }
      seen.add(printing.cardId);
      const displayName = legendDisplayName(printing.card);
      results.push({
        id: printing.cardId,
        slug: printing.cardId,
        name: displayName,
        // The source list being corrected may spell the card either way.
        altNames: cardSearchAltNames(printing.card, [printing.printedName]),
        card: {
          cardId: printing.cardId,
          cardName: displayName,
          cardType: printing.card.type,
          cardTypes: printing.card.types,
          superTypes: printing.card.superTypes,
          domains: printing.card.domains,
          shortCode: printing.shortCode,
          preferredPrintingId: null,
        },
      });
    }
    return results;
  }, [allPrintings]);

  const codesByCardId = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.id,
          [{ shortCode: row.card.shortCode, publicCode: row.card.shortCode }],
        ]),
      ),
    [rows],
  );

  return { rows, codesByCardId };
}
