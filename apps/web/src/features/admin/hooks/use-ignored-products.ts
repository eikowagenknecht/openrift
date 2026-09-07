import { adminIgnoredProductsContract } from "@openrift/shared/contracts/admin/ignored-products";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { IgnoredProductsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

interface UnignoreProductInput {
  level: "product";
  marketplace: Marketplace;
  externalId: number;
}

interface UnignoreVariantInput {
  level: "variant";
  marketplace: Marketplace;
  externalId: number;
  finish: string;
  language: string | null;
}

type UnignoreInput = UnignoreProductInput | UnignoreVariantInput;

const fetchIgnoredProducts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<IgnoredProductsResponse> =>
    apiOrpcClient(adminIgnoredProductsContract, context.cookie).list(),
  );

export const ignoredProductsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredProducts,
  queryFn: () => fetchIgnoredProducts(),
});

export function useIgnoredProducts() {
  return useSuspenseQuery(ignoredProductsQueryOptions);
}

const unignoreProductFn = createServerFn({ method: "POST" })
  .validator((input: UnignoreInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const body =
      data.level === "product"
        ? {
            level: "product" as const,
            marketplace: data.marketplace,
            products: [{ externalId: data.externalId }],
          }
        : {
            level: "variant" as const,
            marketplace: data.marketplace,
            products: [
              { externalId: data.externalId, finish: data.finish, language: data.language },
            ],
          };

    await apiOrpcClient(adminIgnoredProductsContract, context.cookie).unignore(body);
  });

export function useUnignoreProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UnignoreInput) => unignoreProductFn({ data: input }),
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
