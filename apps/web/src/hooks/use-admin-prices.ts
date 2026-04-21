import type { ClearPricesResponse, PriceRefreshResponse } from "@openrift/shared";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { refreshActions, clearActions } from "@/components/admin/refresh-actions";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

// ── Server function for clear prices ─────────────────────────────────────────

const clearPricesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { marketplace: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<ClearPricesResponse>({
      errorTitle: "Couldn't clear prices",
      cookie: context.cookie,
      path: "/api/v1/admin/clear-prices",
      method: "POST",
      body: { marketplace: data.marketplace },
    }),
  );

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
