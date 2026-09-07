import type { Printing } from "@openrift/shared";
import { cardSearchAltNames, legendDisplayName } from "@openrift/shared";
import { useMemo, useState } from "react";

import { CatalogSearchCombobox } from "@/components/cards/card-search-dropdown";
import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { ImportPrintingLabel } from "@/components/cards/printing-label";
import { PrintingThumbnail } from "@/components/cards/printing-option-content";
import { useCardSearch } from "@/hooks/use-card-search";

const MAX_RESULTS = 20;
const MIN_QUERY_LENGTH = 1;

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
        altNames: cardSearchAltNames(printing.card, [printing.printedName]),
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
          <PrintingThumbnail printing={row.printing} className="h-10" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{row.name}</span>
            <span className="text-muted-foreground min-w-0 truncate text-xs">
              <ImportPrintingLabel printing={row.printing} />
            </span>
          </span>
        </div>
      )}
      renderActivePreview={(row, anchorRef) => (
        // Keyed per printing: without a fresh mount, the position effect won't
        // re-run after an imageless entry unmounts the preview.
        <PrintingHoverPreview key={row.id} printing={row.printing} anchorRef={anchorRef} />
      )}
      onSelect={(row) => onSelect(row.printing)}
    />
  );
}
