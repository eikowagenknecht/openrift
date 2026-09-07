import { useQuery } from "@tanstack/react-query";

import { useLiveTradesByPrinting } from "@/hooks/use-card-trades";
import { loansQueryOptions } from "@/hooks/use-loans";
import { useUserId } from "@/lib/auth-session";
import type { CardHoldingLine } from "@/lib/card-holdings";
import { cardHoldingLines } from "@/lib/card-holdings";

/**
 * Loan and live-trade lines for `printingIds`. Both reads reuse the
 * whole-account queries cached elsewhere, so a detail costs no per-card fetch.
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
