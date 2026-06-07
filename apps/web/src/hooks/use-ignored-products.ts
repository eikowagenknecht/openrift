import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { IgnoredProductsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";

type Marketplace = "tcgplayer" | "cardmarket" | "cardtrader";

/** Unignore a whole upstream product (level 2). */
interface UnignoreProductInput {
  level: "product";
  marketplace: Marketplace;
  externalId: number;
}

/** Unignore one specific SKU of an upstream product (level 3). */
interface UnignoreVariantInput {
  level: "variant";
  marketplace: Marketplace;
  externalId: number;
  finish: string;
  /** `null` for marketplaces that don't expose language as a SKU dimension (CM/TCG). */
  language: string | null;
}

type UnignoreInput = UnignoreProductInput | UnignoreVariantInput;

const fetchIgnoredProducts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<IgnoredProductsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["ignored-products"].$get(),
        "Couldn't load ignored products",
      ),
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

    await callApi(
      serverApiClient(context.cookie).api.admin.v1["ignored-products"].$delete({
        json: body,
      }),
      "Couldn't unignore product",
    );
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
