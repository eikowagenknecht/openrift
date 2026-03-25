import type { ClearPricesResponse, PriceRefreshResponse } from "@openrift/shared";
import { useMutation } from "@tanstack/react-query";

import { refreshActions, clearActions } from "@/components/admin/refresh-actions";
import { assertOk, client } from "@/lib/rpc-client";

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRefreshPrices(cronKey: "tcgplayer" | "cardmarket" | "cardtrader") {
  const refreshAction = refreshActions[cronKey];
  return useMutation({
    mutationFn: async (): Promise<PriceRefreshResponse> => {
      const res = await refreshAction.post();
      assertOk(res);
      return await res.json();
    },
  });
}

export function useClearPrices(cronKey: "tcgplayer" | "cardmarket" | "cardtrader") {
  const clearAction = clearActions[cronKey];
  return useMutation({
    mutationFn: async (): Promise<ClearPricesResponse> => {
      const res = await client.api.v1.admin["clear-prices"].$post({
        json: { marketplace: clearAction.source },
      });
      assertOk(res);
      return await res.json();
    },
  });
}
