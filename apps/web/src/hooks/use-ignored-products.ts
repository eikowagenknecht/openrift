import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export const ignoredProductsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredProducts,
  queryFn: () => rpc(client.api.admin["ignored-products"].$get()),
});

export function useIgnoredProducts() {
  return useSuspenseQuery(ignoredProductsQueryOptions);
}

export function useUnignoreProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (product: {
      marketplace: "tcgplayer" | "cardmarket";
      externalId: number;
      finish: string;
    }) =>
      rpc(
        client.api.admin["ignored-products"].$delete({
          json: {
            source: product.marketplace,
            products: [{ externalId: product.externalId, finish: product.finish }],
          },
        }),
      ),
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
