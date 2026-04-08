import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { IgnoredProductsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchIgnoredProducts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<IgnoredProductsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/ignored-products`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Ignored products fetch failed: ${res.status}`);
    }
    return res.json() as Promise<IgnoredProductsResponse>;
  });

export const ignoredProductsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredProducts,
  queryFn: () => fetchIgnoredProducts(),
});

export function useIgnoredProducts() {
  return useSuspenseQuery(ignoredProductsQueryOptions);
}

const unignoreProductFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      externalId: number;
      finish: string;
      language: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/ignored-products`, {
      method: "DELETE",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        marketplace: data.marketplace,
        products: [{ externalId: data.externalId, finish: data.finish, language: data.language }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Unignore product failed: ${res.status}`);
    }
  });

export function useUnignoreProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (product: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      externalId: number;
      finish: string;
      language: string;
    }) => unignoreProductFn({ data: product }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.ignoredProducts,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.unifiedMappings.all,
      });
    },
  });
}
