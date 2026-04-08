import type { ClearPricesResponse, PriceRefreshResponse } from "@openrift/shared";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { refreshActions, clearActions } from "@/components/admin/refresh-actions";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

// ── Server function for clear prices ─────────────────────────────────────────

const clearPricesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { marketplace: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/clear-prices`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ marketplace: data.marketplace }),
    });
    if (!res.ok) {
      throw new Error(`Clear prices failed: ${res.status}`);
    }
    return res.json() as Promise<ClearPricesResponse>;
  });

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRefreshPrices(cronKey: "tcgplayer" | "cardmarket" | "cardtrader") {
  const refreshAction = refreshActions[cronKey];
  return useMutation({
    mutationFn: (): Promise<PriceRefreshResponse> =>
      refreshAction.post() as Promise<PriceRefreshResponse>,
  });
}

export function useClearPrices(cronKey: "tcgplayer" | "cardmarket" | "cardtrader") {
  const clearAction = clearActions[cronKey];
  return useMutation({
    mutationFn: (): Promise<ClearPricesResponse> =>
      clearPricesFn({ data: { marketplace: clearAction.source } }),
  });
}
