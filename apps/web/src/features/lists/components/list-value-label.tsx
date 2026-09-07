import type { ListEntryDetailResponse, ListKind } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";

import { useCardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useCards } from "@/features/cards/hooks/use-cards";
import { computeListValue } from "@/features/lists/lib/list-value";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

interface ListValueLabelProps {
  kind: ListKind;
  entries: readonly ListEntryDetailResponse[];
}

/** SSR-unsafe via the `useSuspenseQuery` hooks below; consumers gate mount with `useHydrated()`. */
export function ListValueLabel({ kind, entries }: ListValueLabelProps) {
  const display = useCardThumbnailDisplay();
  const { printingsByCardId } = useCards();
  const userLanguages = useDisplayStore((state) => state.languages);

  const scopedPrintingsByCardId =
    kind === "card" ? filterPrintingsByLanguages(printingsByCardId, userLanguages) : EMPTY_MAP;

  const { value, unpriced } = computeListValue({
    entries,
    prices: display.prices,
    marketplace: display.favoriteMarketplace,
    printingsByCardId: scopedPrintingsByCardId,
  });

  const format = formatterForMarketplace(display.favoriteMarketplace);

  return (
    <span className="text-muted-foreground shrink-0 text-xs">
      {format(value)}
      {unpriced > 0 ? (
        <span className="text-muted-foreground/60 ml-1">({unpriced} unpriced)</span>
      ) : null}
    </span>
  );
}

const EMPTY_MAP: ReadonlyMap<string, Printing[]> = new Map();

function filterPrintingsByLanguages(
  source: ReadonlyMap<string, Printing[]>,
  userLanguages: readonly string[],
): Map<string, Printing[]> {
  if (userLanguages.length === 0) {
    return new Map(source);
  }
  const allowed = new Set(userLanguages);
  const result = new Map<string, Printing[]>();
  for (const [cardId, printings] of source) {
    const filtered = printings.filter((printing) => allowed.has(printing.language));
    if (filtered.length > 0) {
      result.set(cardId, filtered);
    }
  }
  return result;
}
