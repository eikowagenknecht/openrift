import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

interface IgnoredProduct {
  marketplace: "tcgplayer" | "cardmarket";
  externalId: number;
  finish: string;
  productName: string;
  createdAt: string;
}

interface IgnoredProductsResponse {
  products: IgnoredProduct[];
}

export function useIgnoredProducts() {
  return useQuery({
    queryKey: queryKeys.admin.ignoredProducts,
    queryFn: () => rpc<IgnoredProductsResponse>(client.api.admin["ignored-products"].$get()),
  });
}

export function useUnignoreProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (product: {
      marketplace: "tcgplayer" | "cardmarket";
      externalId: number;
      finish: string;
    }) =>
      rpc<{ ok: boolean }>(
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
