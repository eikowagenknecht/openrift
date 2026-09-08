import { useCards } from "@/features/cards/hooks/use-cards";
import { usePrices } from "@/features/cards/hooks/use-prices";
import { useOwnedCount } from "@/features/collections/hooks/use-owned-count";
import { useMetaDeckCards } from "@/features/meta/hooks/use-meta";
import type { MetaDeckCost } from "@/features/meta/lib/meta-deck-collection";
import {
  cheapestPriceByCardId,
  decodeMetaDeckCardIndex,
  metaDeckCosts,
  ownedCountsByCardId,
} from "@/features/meta/lib/meta-deck-collection";
import type { MetaDateRange } from "@/features/meta/lib/meta-scope";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useDisplayStore } from "@/stores/display-store";

/** Reads a live query, so it must sit under `useHydrated`. */
export function useMetaDeckCosts(
  includeSideboard: boolean,
  options: { withCollection: boolean; range?: MetaDateRange },
): ReadonlyMap<string, MetaDeckCost> | undefined {
  const { data: index } = useMetaDeckCards(options.range);
  const { printingsByCardId } = useCards();
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0]);
  const languageOrder = useEffectiveLanguageOrder();
  const { data: ownedByPrinting } = useOwnedCount(options.withCollection);

  if (options.withCollection && ownedByPrinting === undefined) {
    return undefined;
  }
  return metaDeckCosts(decodeMetaDeckCardIndex(index), {
    includeSideboard,
    prices: cheapestPriceByCardId(printingsByCardId, prices, marketplace, languageOrder),
    ownedByCardId:
      ownedByPrinting === undefined
        ? undefined
        : ownedCountsByCardId(ownedByPrinting, printingsByCardId),
  });
}
