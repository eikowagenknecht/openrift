import { useMutation } from "@tanstack/react-query";

import { refreshActions, clearActions } from "@/components/admin/refresh-actions";
import { client, rpc } from "@/lib/rpc-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceResult {
  transformed: {
    groups: number;
    products: number;
    prices: number;
  };
  upserted: {
    snapshots: { total: number; new: number; updated: number; unchanged: number };
    staging: { total: number; new: number; updated: number; unchanged: number };
  };
}

interface ClearPriceResult {
  source: string;
  deleted: { snapshots: number; sources: number; staging: number };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRefreshPrices(cronKey: "tcgplayer" | "cardmarket") {
  const refreshAction = refreshActions[cronKey];
  return useMutation({
    mutationFn: async (): Promise<PriceResult | null> => (await rpc(refreshAction.post())) ?? null,
  });
}

export function useClearPrices(cronKey: "tcgplayer" | "cardmarket") {
  const clearAction = clearActions[cronKey];
  return useMutation({
    mutationFn: (): Promise<ClearPriceResult> =>
      rpc(client.api.admin["clear-prices"].$post({ json: { source: clearAction.source } })),
  });
}
