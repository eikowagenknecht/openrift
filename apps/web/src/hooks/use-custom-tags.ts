import type { CustomTagCategoryResponse, CustomTagResponse } from "@openrift/shared";
import { adminCustomTagsContract } from "@openrift/shared/contracts/admin/custom-tags";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminCustomTagsResponse {
  tags: CustomTagResponse[];
}

interface AdminCustomTagCategoriesResponse {
  categories: CustomTagCategoryResponse[];
}

interface CardCustomTagsResponse {
  customTagIds: string[];
}

// ── List custom tags (admin) ───────────────────────────────────────────────

const fetchCustomTags = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminCustomTagsResponse> =>
    apiOrpcClient(adminCustomTagsContract, context.cookie).listTags(),
  );

export const adminCustomTagsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.customTags,
  queryFn: () => fetchCustomTags(),
  staleTime: 30 * 60 * 1000,
});

export function useCustomTags() {
  return useSuspenseQuery(adminCustomTagsQueryOptions);
}

// ── List custom-tag categories (admin) ─────────────────────────────────────

const fetchCustomTagCategories = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminCustomTagCategoriesResponse> =>
    apiOrpcClient(adminCustomTagsContract, context.cookie).listCategories(),
  );

export const adminCustomTagCategoriesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.customTagCategories,
  queryFn: () => fetchCustomTagCategories(),
  staleTime: 30 * 60 * 1000,
});

export function useCustomTagCategories() {
  return useSuspenseQuery(adminCustomTagCategoriesQueryOptions);
}

// ── Create / update / delete categories ────────────────────────────────────

const createCustomTagCategoryFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCustomTagsContract, context.cookie).createCategory(data);
  });

export function useCreateCustomTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; description?: string | null }) =>
      createCustomTagCategoryFn({ data: vars }),
    invalidates: [queryKeys.admin.customTagCategories, queryKeys.admin.customTags],
  });
}

const updateCustomTagCategoryFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; slug?: string; label?: string; description?: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCustomTagsContract, context.cookie).updateCategory(data);
  });

export function useUpdateCustomTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (vars: {
      id: string;
      slug?: string;
      label?: string;
      description?: string | null;
    }) => updateCustomTagCategoryFn({ data: vars }),
    invalidates: [queryKeys.admin.customTagCategories, queryKeys.admin.customTags],
  });
}

const deleteCustomTagCategoryFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCustomTagsContract, context.cookie).removeCategory({ id: data.id });
  });

export function useDeleteCustomTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteCustomTagCategoryFn({ data: { id } }),
    invalidates: [queryKeys.admin.customTagCategories, queryKeys.admin.customTags],
  });
}

// ── Create / update / delete tags ──────────────────────────────────────────

const createCustomTagFn = createServerFn({ method: "POST" })
  .validator(
    (input: { slug: string; label: string; categoryId: string; description?: string | null }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCustomTagsContract, context.cookie).createTag(data);
  });

export function useCreateCustomTag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: {
      slug: string;
      label: string;
      categoryId: string;
      description?: string | null;
    }) => createCustomTagFn({ data: vars }),
    invalidates: [queryKeys.admin.customTags, queryKeys.admin.customTagCategories],
  });
}

const updateCustomTagFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      slug?: string;
      label?: string;
      categoryId?: string;
      description?: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCustomTagsContract, context.cookie).updateTag(data);
  });

export function useUpdateCustomTag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: {
      id: string;
      slug?: string;
      label?: string;
      categoryId?: string;
      description?: string | null;
    }) => updateCustomTagFn({ data: vars }),
    invalidates: [queryKeys.admin.customTags, queryKeys.admin.customTagCategories],
  });
}

const deleteCustomTagFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCustomTagsContract, context.cookie).removeTag({ id: data.id });
  });

export function useDeleteCustomTag() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteCustomTagFn({ data: { id } }),
    invalidates: [queryKeys.admin.customTags, queryKeys.admin.customTagCategories],
  });
}

// ── Clear all card assignments for a tag ───────────────────────────────────

interface ClearCustomTagCardsResponse {
  removed: number;
}

const clearCustomTagCardsFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ClearCustomTagCardsResponse> =>
    apiOrpcClient(adminCustomTagsContract, context.cookie).clearCards({ id: data.id }),
  );

export function useClearCustomTagCards() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => clearCustomTagCardsFn({ data: { id } }),
    invalidates: [
      queryKeys.admin.customTags,
      queryKeys.admin.cardCustomTags.prefix,
      queryKeys.catalog.all,
    ],
  });
}

// ── Per-card assignment ────────────────────────────────────────────────────

const fetchCardCustomTags = createServerFn({ method: "GET" })
  .validator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CardCustomTagsResponse> =>
    apiOrpcClient(adminCustomTagsContract, context.cookie).getCardTags({ id: data.cardId }),
  );

function cardCustomTagsQueryOptions(cardId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cardCustomTags(cardId),
    queryFn: () => fetchCardCustomTags({ data: { cardId } }),
    staleTime: 30 * 60 * 1000,
  });
}

export function useCardCustomTags(cardId: string) {
  return useSuspenseQuery(cardCustomTagsQueryOptions(cardId));
}

const setCardCustomTagsFn = createServerFn({ method: "POST" })
  .validator((input: { cardId: string; customTagIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCustomTagsContract, context.cookie).setCardTags({
      id: data.cardId,
      customTagIds: data.customTagIds,
    });
  });

export function useSetCardCustomTags(cardId: string) {
  return useMutationWithInvalidation({
    mutationFn: (customTagIds: string[]) => setCardCustomTagsFn({ data: { cardId, customTagIds } }),
    invalidates: [queryKeys.admin.cardCustomTags(cardId), queryKeys.admin.customTags],
  });
}

// ── Bulk attach (used by the decklist-style import in the admin UI) ────────

interface AddCardsToCustomTagResponse {
  added: number;
  requested: number;
}

const addCardsToCustomTagFn = createServerFn({ method: "POST" })
  .validator((input: { tagId: string; cardIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AddCardsToCustomTagResponse> =>
    apiOrpcClient(adminCustomTagsContract, context.cookie).addCards({
      id: data.tagId,
      cardIds: data.cardIds,
    }),
  );

export function useAddCardsToCustomTag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { tagId: string; cardIds: string[] }) =>
      addCardsToCustomTagFn({ data: vars }),
    invalidates: [
      queryKeys.admin.customTags,
      queryKeys.admin.cardCustomTags.prefix,
      queryKeys.catalog.all,
    ],
  });
}
