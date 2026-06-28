import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { PrintingThumbnail } from "@/components/cards/printing-option-content";
import { ImportCatalogSearch } from "@/components/import/import-catalog-search";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatImportPrintingLabel } from "@/lib/format";

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
  const { labels } = useEnumOrders();

  return (
    <ImportCatalogSearch<Printing>
      ariaLabel="Search catalog"
      placeholder="Search catalog..."
      getResults={(query) => {
        const lower = query.toLowerCase();
        return allPrintings
          .filter(
            (printing) =>
              legendDisplayName(printing.card).toLowerCase().includes(lower) ||
              printing.shortCode.toLowerCase().includes(lower),
          )
          .slice(0, MAX_RESULTS);
      }}
      getKey={(printing) => printing.id}
      renderItem={(printing) => (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PrintingThumbnail printing={printing} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{legendDisplayName(printing.card)}</span>
            <span className="text-muted-foreground truncate font-mono text-xs">
              {formatImportPrintingLabel(printing, labels)}
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
