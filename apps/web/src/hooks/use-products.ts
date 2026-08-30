import type { Printing } from "@openrift/shared";
import { isReleasedIn, todayUtc } from "@openrift/shared";
import { adminProductsContract } from "@openrift/shared/contracts/admin/products";
import type {
  ProductDetailResponse,
  ProductsListResponse,
} from "@openrift/shared/contracts/products";
import { productsContract } from "@openrift/shared/contracts/products";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

type CreateProductInput = ContractInput<typeof adminProductsContract, "create">;
type UpdateProductInput = ContractInput<typeof adminProductsContract, "update">;

// ── Public reads ─────────────────────────────────────────────────────────────

const fetchProducts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<ProductsListResponse> =>
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

/** A product detail payload with its printings joined to cards and sets. */
export interface EnrichedProductDetail {
  product: ProductDetailResponse["product"];
  contents: ProductDetailResponse["contents"];
  sets: ProductDetailResponse["sets"];
  /** The product's printings, in the payload's canonical order. */
  printings: Printing[];
  /** Same printings keyed by id, for resolving `contents` quantities. */
  printingsById: Record<string, Printing>;
}

/**
 * Joins the inlined cards and sets onto the wire printings, the same shape
 * `enrichSetDetail` produces. Doing it here (rather than against the global
 * catalog) is what lets the product page render server-side.
 *
 * @returns The payload with `Printing` objects ready for the grid.
 */
function enrichProductDetail(response: ProductDetailResponse): EnrichedProductDetail {
  const setById = new Map(response.sets.map((set) => [set.id, set]));
  const today = todayUtc();
  const printings: Printing[] = [];
  const printingsById: Record<string, Printing> = {};
  for (const wire of response.printings) {
    const set = setById.get(wire.setId);
    const card = response.cards[wire.cardId];
    // A printing whose set or card is missing can't be rendered; the catalogue
    // guarantees both, so this only guards against a partial payload.
    if (!set || !card) {
      continue;
    }
    const printing: Printing = {
      ...wire,
      setSlug: set.slug,
      setReleased: isReleasedIn(set.releases, wire.language, today),
      card,
    };
    printings.push(printing);
    printingsById[printing.id] = printing;
  }
  return {
    product: response.product,
    contents: response.contents,
    sets: response.sets,
    printings,
    printingsById,
  };
}

export function productDetailQueryOptions(slug: string) {
  return queryOptions({
    queryKey: queryKeys.products.detail(slug),
    queryFn: () => fetchProductDetail({ data: slug }),
    staleTime: 5 * 60 * 1000,
    select: enrichProductDetail,
  });
}

export function useProductDetail(slug: string) {
  return useSuspenseQuery(productDetailQueryOptions(slug));
}

// ── Admin mutations (grantable section "products") ───────────────────────────

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
