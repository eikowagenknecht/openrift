import type { ClassifiedCardTag, TagCategoryResponse } from "@openrift/shared";
import { adminCardTagsContract } from "@openrift/shared/contracts/admin/card-tags";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminCardTagsResponse {
  tags: ClassifiedCardTag[];
}

interface AdminTagCategoriesResponse {
  categories: TagCategoryResponse[];
}

// ── List distinct printed tags with their classification (admin) ────────────

const fetchCardTags = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminCardTagsResponse> =>
      apiOrpcClient(adminCardTagsContract, context.cookie).listTags(),
  );

export const adminCardTagsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cardTags,
  queryFn: () => fetchCardTags(),
  staleTime: 30 * 60 * 1000,
});

export function useCardTags() {
  return useSuspenseQuery(adminCardTagsQueryOptions);
}

// ── List tag categories (admin) ─────────────────────────────────────────────

const fetchTagCategories = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminTagCategoriesResponse> =>
      apiOrpcClient(adminCardTagsContract, context.cookie).listCategories(),
  );

export const adminTagCategoriesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.tagCategories,
  queryFn: () => fetchTagCategories(),
  staleTime: 30 * 60 * 1000,
});

export function useTagCategoryList() {
  return useSuspenseQuery(adminTagCategoriesQueryOptions);
}

// ── Create / update / delete categories ─────────────────────────────────────

const createTagCategoryFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTagsContract, context.cookie).createCategory(data);
  });

export function useCreateTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; description?: string | null }) =>
      createTagCategoryFn({ data: vars }),
    invalidates: [queryKeys.admin.tagCategories, queryKeys.admin.cardTags, queryKeys.init.all],
  });
}

const updateTagCategoryFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; slug?: string; label?: string; description?: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTagsContract, context.cookie).updateCategory(data);
  });

export function useUpdateTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (vars: {
      id: string;
      slug?: string;
      label?: string;
      description?: string | null;
    }) => updateTagCategoryFn({ data: vars }),
    invalidates: [queryKeys.admin.tagCategories, queryKeys.admin.cardTags, queryKeys.init.all],
  });
}

const deleteTagCategoryFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTagsContract, context.cookie).removeCategory({ id: data.id });
  });

export function useDeleteTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteTagCategoryFn({ data: { id } }),
    invalidates: [queryKeys.admin.tagCategories, queryKeys.admin.cardTags, queryKeys.init.all],
  });
}

// ── Classify one tag ─────────────────────────────────────────────────────────

const setTagCategoryFn = createServerFn({ method: "POST" })
  .validator((input: { tag: string; categoryId: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTagsContract, context.cookie).setTagCategory(data);
  });

export function useSetTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { tag: string; categoryId: string | null }) =>
      setTagCategoryFn({ data: vars }),
    // The init invalidation only refreshes this admin's own client cache; the
    // edge-cached /init means other visitors pick the change up within ~1h.
    invalidates: [queryKeys.admin.cardTags, queryKeys.admin.tagCategories, queryKeys.init.all],
  });
}

// ── Detect legend tags from Legend cards ─────────────────────────────────────

interface DetectLegendTagsResponse {
  found: number;
  assigned: number;
}

const detectLegendTagsFn = createServerFn({ method: "POST" })
  .validator((input: { categoryId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DetectLegendTagsResponse> =>
      apiOrpcClient(adminCardTagsContract, context.cookie).detectLegendTags(data),
  );

export function useDetectLegendTags() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { categoryId: string }) => detectLegendTagsFn({ data: vars }),
    invalidates: [queryKeys.admin.cardTags, queryKeys.admin.tagCategories, queryKeys.init.all],
  });
}
