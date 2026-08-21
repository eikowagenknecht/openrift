import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useMemo, useState } from "react";

import { CatalogSearchCombobox } from "@/components/cards/card-search-dropdown";
import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { ImportPrintingLabel } from "@/components/cards/printing-label";
import { PrintingThumbnail } from "@/components/cards/printing-option-content";
import { useCardSearch } from "@/hooks/use-card-search";

const MAX_RESULTS = 20;

/** One letter is a useful filter here, the way it is in the palettes. */
const MIN_QUERY_LENGTH = 1;

/**
 * Searches the full printing catalog by card name or short code, returning a
 * Printing on selection (one entry per printing — variants are distinct).
 * Hovering (or keyboard-highlighting) a result shows a large card preview so
 * the user can tell near-identical printings apart.
 *
 * Printing-scoped, so the shared matcher is fed one row per printing rather
 * than one per card: the row's own code is what the searcher is holding when
 * they type `OGN-202`, and two variants of a card must be able to rank apart.
 *
 * @returns An inline combobox for picking a printing.
 */
export function PrintingSearch({
  allPrintings,
  onSelect,
}: {
  allPrintings: Printing[];
  onSelect: (printing: Printing) => void;
}) {
  const [query, setQuery] = useState("");

  const searchable = useMemo(
    () =>
      allPrintings.map((printing) => ({
        id: printing.id,
        slug: printing.shortCode,
        name: legendDisplayName(printing.card),
        printing,
      })),
    [allPrintings],
  );
  const codesByRowId = useMemo(
    () =>
      new Map(
        allPrintings.map((printing) => [
          printing.id,
          [{ shortCode: printing.shortCode, publicCode: printing.publicCode }],
        ]),
      ),
    [allPrintings],
  );

  const results = useCardSearch(searchable, query, codesByRowId, MAX_RESULTS, MIN_QUERY_LENGTH);

  return (
    <CatalogSearchCombobox<(typeof searchable)[number]>
      ariaLabel="Search catalog"
      placeholder="Search catalog..."
      className="h-7 w-44"
      results={results}
      onQueryChange={setQuery}
      getKey={(row) => row.id}
      renderItem={(row) => (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PrintingThumbnail printing={row.printing} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{row.name}</span>
            <span className="text-muted-foreground min-w-0 text-xs">
              <ImportPrintingLabel printing={row.printing} />
            </span>
          </span>
        </div>
      )}
      renderActivePreview={(row, anchorRef) => (
        // Keyed per printing so the preview remounts on each hover; without a
        // fresh mount the position effect won't re-run after an imageless entry
        // unmounts the preview, leaving later previews mispositioned.
        <PrintingHoverPreview key={row.id} printing={row.printing} anchorRef={anchorRef} />
      )}
      onSelect={(row) => onSelect(row.printing)}
    />
  );
}
