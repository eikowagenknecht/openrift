import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { ImportPrintingLabel } from "@/components/cards/printing-label";
import { PrintingThumbnail } from "@/components/cards/printing-option-content";
import { ImportCatalogSearch } from "@/components/import/import-catalog-search";
import { matchesAllTokens, searchTokens } from "@/lib/search-match";

const MAX_RESULTS = 20;

/**
 * Searches the full printing catalog by card name or short code, returning a
 * Printing on selection (one entry per printing — variants are distinct).
 * Hovering (or keyboard-highlighting) a result shows a large card preview so
 * the user can tell near-identical printings apart.
 * @returns An inline combobox for picking a printing.
 */
export function PrintingSearch({
  allPrintings,
  onSelect,
}: {
  allPrintings: Printing[];
  onSelect: (printing: Printing) => void;
}) {
  return (
    <ImportCatalogSearch<Printing>
      ariaLabel="Search catalog"
      placeholder="Search catalog..."
      getResults={(query) => {
        const tokens = searchTokens(query);
        if (tokens.length === 0) {
          return [];
        }
        return allPrintings
          .filter((printing) =>
            matchesAllTokens(tokens, legendDisplayName(printing.card), printing.shortCode),
          )
          .slice(0, MAX_RESULTS);
      }}
      getKey={(printing) => printing.id}
      renderItem={(printing) => (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PrintingThumbnail printing={printing} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{legendDisplayName(printing.card)}</span>
            <span className="text-muted-foreground min-w-0 text-xs">
              <ImportPrintingLabel printing={printing} />
            </span>
          </span>
        </div>
      )}
      renderActivePreview={(printing, anchorRef) => (
        // Keyed per printing so the preview remounts on each hover; without a
        // fresh mount the position effect won't re-run after an imageless entry
        // unmounts the preview, leaving later previews mispositioned.
        <PrintingHoverPreview key={printing.id} printing={printing} anchorRef={anchorRef} />
      )}
      onSelect={onSelect}
    />
  );
}
