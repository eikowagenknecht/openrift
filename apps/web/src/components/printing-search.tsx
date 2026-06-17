import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import { ImportCatalogSearch } from "@/components/import/import-catalog-search";
import type { EnumLabels } from "@/hooks/use-enums";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId, formatPrintingLabel } from "@/lib/format";

const MAX_RESULTS = 20;

/**
 * Formats a printing label for import/search contexts. Shows the card ID plus
 * the variant label (unless it's "Standard", in which case just the ID).
 * @returns A formatted string like "RB1-042 · Foil" or just "RB1-042".
 */
export function formatImportPrintingLabel(printing: Printing, labels: EnumLabels): string {
  const label = formatPrintingLabel(printing, undefined, labels);
  if (label === "Standard") {
    return formatCardId(printing);
  }
  return `${formatCardId(printing)} · ${label}`;
}

/**
 * Searches the full printing catalog by card name or short code, returning a
 * Printing on selection (one entry per printing — variants are distinct).
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
        <>
          <span className="truncate font-medium">{legendDisplayName(printing.card)}</span>
          <span className="text-muted-foreground shrink-0">
            {formatImportPrintingLabel(printing, labels)}
          </span>
        </>
      )}
      onSelect={onSelect}
    />
  );
}
