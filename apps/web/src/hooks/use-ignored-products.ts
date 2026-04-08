import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
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

export function useUnignoreProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      externalId: number;
      finish: string;
      language: string;
    }) => {
      const res = await client.api.v1.admin["ignored-products"].$delete({
        json: {
          marketplace: product.marketplace,
          products: [
            { externalId: product.externalId, finish: product.finish, language: product.language },
          ],
        },
      });
      assertOk(res);
    },
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
