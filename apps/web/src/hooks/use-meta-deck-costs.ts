import { useCards } from "@/hooks/use-cards";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useMetaDeckCards } from "@/hooks/use-meta";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { usePrices } from "@/hooks/use-prices";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import {
  cheapestPriceByCardId,
  decodeMetaDeckCardIndex,
  metaDeckCosts,
  ownedCountsByCardId,
} from "@/lib/meta-deck-collection";
import { useDisplayStore } from "@/stores/display-store";

/**
 * Undefined while a requested collection is still loading. Reads a live query,
 * so it must sit under `useHydrated`.
 */
export function useMetaDeckCosts(
  includeSideboard: boolean,
  options: { withCollection: boolean },
): ReadonlyMap<string, MetaDeckCost> | undefined {
  const { data: index } = useMetaDeckCards();
  const { printingsByCardId } = useCards();
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
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
