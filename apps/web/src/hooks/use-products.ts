import type { ProductDetailResponse, ProductsListResponse } from "@openrift/shared/contracts";
import { adminProductsContract, productsContract } from "@openrift/shared/contracts";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Public reads ─────────────────────────────────────────────────────────────

const fetchProducts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<ProductsListResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "products"],
        queryFn: () => apiOrpcClient(productsContract, context.cookie).list(),
      }),
  );

export const productsListQueryOptions = queryOptions({
  queryKey: queryKeys.products.all,
  queryFn: () => fetchProducts(),
  staleTime: 5 * 60 * 1000,
});

export function useProductsList() {
  return useSuspenseQuery(productsListQueryOptions);
}

const fetchProductDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }): Promise<ProductDetailResponse> => {
    // 404 maps to the NOT_FOUND sentinel the route boundary expects.
    const { error, data } = await safe(
      apiOrpcClient(productsContract, context.cookie).get({ slug }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function productDetailQueryOptions(slug: string) {
  return queryOptions({
    queryKey: queryKeys.products.detail(slug),
    queryFn: () => fetchProductDetail({ data: slug }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProductDetail(slug: string) {
  return useSuspenseQuery(productDetailQueryOptions(slug));
}

// ── Admin mutations (grantable section "products") ───────────────────────────

interface CreateProductInput {
  slug: string;
  name: string;
  description?: string | null;
  listId: string;
}

/**
 * The public products list is served through the shared `serverCache`, which
 * mutations must bust explicitly — otherwise the client-side invalidation
 * refetches through the still-fresh server cache and pins the stale list for
 * another `staleTime` round (empty admin table right after a create).
 * @returns A promise that resolves once the cache entry is invalidated.
 */
function invalidateProductsServerCache(): Promise<void> {
  return serverCache.invalidateQueries({ queryKey: ["server-cache", "products"] });
}

const createProductFn = createServerFn({ method: "POST" })
  .validator((input: CreateProductInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const result = await apiOrpcClient(adminProductsContract, context.cookie).create(data);
    await invalidateProductsServerCache();
    return result;
  });

export function useCreateProduct() {
  return useMutationWithInvalidation({
    mutationFn: (vars: CreateProductInput) => createProductFn({ data: vars }),
    invalidates: [queryKeys.products.all],
  });
}

const resyncProductFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; listId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminProductsContract, context.cookie).resyncContents(data);
    await invalidateProductsServerCache();
  });

export function useResyncProduct() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; listId: string }) => resyncProductFn({ data: vars }),
    invalidates: [queryKeys.products.all],
  });
}

interface UpdateProductInput {
  id: string;
  slug?: string;
  name?: string;
  description?: string | null;
}

const updateProductFn = createServerFn({ method: "POST" })
  .validator((input: UpdateProductInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminProductsContract, context.cookie).update(data);
    await invalidateProductsServerCache();
  });

export function useUpdateProduct() {
  return useMutationWithInvalidation({
    mutationFn: (vars: UpdateProductInput) => updateProductFn({ data: vars }),
    invalidates: [queryKeys.products.all],
  });
}

const deleteProductFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminProductsContract, context.cookie).remove(data);
    await invalidateProductsServerCache();
  });

export function useDeleteProduct() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string }) => deleteProductFn({ data: vars }),
    invalidates: [queryKeys.products.all],
  });
}
