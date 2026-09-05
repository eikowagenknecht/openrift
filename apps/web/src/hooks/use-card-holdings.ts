import { useQuery } from "@tanstack/react-query";

import { useLiveTradesByPrinting } from "@/hooks/use-card-trades";
import { loansQueryOptions } from "@/hooks/use-loans";
import { useUserId } from "@/lib/auth-session";
import type { CardHoldingLine } from "@/lib/card-holdings";
import { cardHoldingLines } from "@/lib/card-holdings";

/**
 * The card detail's loan and live-trade lines for `printingIds`. Both reads are
 * the whole-account queries the loans page and the collection tiles already
 * cache, so a detail usually costs no fetch and never one per card.
 */
export function useCardHoldingLines(printingIds: readonly string[]): CardHoldingLine[] {
  const userId = useUserId();
  const { data: loans } = useQuery({
    ...loansQueryOptions(userId ?? ""),
    enabled: userId !== null,
  });
  const { data: liveTrades } = useLiveTradesByPrinting();

  if (userId === null) {
    return [];
  }
  return cardHoldingLines({
    loans: loans?.items ?? [],
    annotations: liveTrades?.annotations ?? [],
    printingIds,
  });
}
