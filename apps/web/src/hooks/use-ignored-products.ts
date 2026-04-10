import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { IgnoredProductsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

type Marketplace = "tcgplayer" | "cardmarket" | "cardtrader";

/** Unignore a whole upstream product (level 2). */
export interface UnignoreProductInput {
  level: "product";
  marketplace: Marketplace;
  externalId: number;
}

/** Unignore one specific SKU of an upstream product (level 3). */
export interface UnignoreVariantInput {
  level: "variant";
  marketplace: Marketplace;
  externalId: number;
  finish: string;
  language: string;
}

export type UnignoreInput = UnignoreProductInput | UnignoreVariantInput;

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
  .inputValidator((input: UnignoreInput) => input)
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

    const res = await fetch(`${API_URL}/api/v1/admin/ignored-products`, {
      method: "DELETE",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Unignore product failed: ${res.status}`);
    }
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
