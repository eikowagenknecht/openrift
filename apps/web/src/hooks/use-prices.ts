import type { ClearPricesResponse, PriceRefreshResponse } from "@openrift/shared";
import { useMutation } from "@tanstack/react-query";

import { refreshActions, clearActions } from "@/components/admin/refresh-actions";
import { client, rpc } from "@/lib/rpc-client";

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRefreshPrices(cronKey: "tcgplayer" | "cardmarket" | "cardtrader") {
  const refreshAction = refreshActions[cronKey];
  return useMutation({
    mutationFn: async (): Promise<PriceRefreshResponse | null> =>
      (await rpc(refreshAction.post())) ?? null,
  });
}

export function useClearPrices(cronKey: "tcgplayer" | "cardmarket" | "cardtrader") {
  const clearAction = clearActions[cronKey];
  return useMutation({
    mutationFn: (): Promise<ClearPricesResponse> =>
      rpc(client.api.admin["clear-prices"].$post({ json: { marketplace: clearAction.source } })),
  });
}
