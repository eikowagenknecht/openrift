import type { ListEntryDetailResponse, ListKind, Printing } from "@openrift/shared";

import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { useCards } from "@/hooks/use-cards";
import { formatterForMarketplace } from "@/lib/format";
import { computeListValue } from "@/lib/list-value";
import { useDisplayStore } from "@/stores/display-store";

interface ListValueLabelProps {
  kind: ListKind;
  entries: readonly ListEntryDetailResponse[];
}

/**
 * Total value of a list at the user's preferred marketplace, with an
 * "(N unpriced)" tail when some entries have no price for that marketplace.
 *
 * Card-kind entries are valued at the cheapest printing of the card scoped to
 * the user's preferred languages (mirrors the in-tile fan-out). Printing- and
 * copy-kind entries are valued at their own printing's price.
 *
 * SSR-unsafe via the `useSuspenseQuery` hooks below; consumers gate mount with
 * `useHydrated()`.
 * @returns A span suitable for inline placement in a page top bar.
 */
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
    <span className="text-muted-foreground hidden shrink-0 items-center gap-x-1.5 text-xs sm:flex">
      <span>
        {format(value)}
        {unpriced > 0 ? (
          <span className="text-muted-foreground/60 ml-1">({unpriced} unpriced)</span>
        ) : null}
      </span>
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
