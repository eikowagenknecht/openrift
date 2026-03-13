import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

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
    queryFn: () => api.get<IgnoredProductsResponse>("/api/admin/ignored-products"),
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
      api.del<{ ok: boolean }>("/api/admin/ignored-products", {
        source: product.marketplace,
        products: [{ externalId: product.externalId, finish: product.finish }],
      }),
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
