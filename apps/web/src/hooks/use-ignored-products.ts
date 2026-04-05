import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export const ignoredProductsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredProducts,
  queryFn: async () => {
    const res = await client.api.v1.admin["ignored-products"].$get();
    assertOk(res);
    return await res.json();
  },
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
