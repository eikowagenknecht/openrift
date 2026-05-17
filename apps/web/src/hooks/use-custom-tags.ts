import type { CustomTagCategoryResponse, CustomTagResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
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
  .handler(
    ({ context }): Promise<AdminCustomTagsResponse> =>
      fetchApiJson<AdminCustomTagsResponse>({
        errorTitle: "Couldn't load custom tags",
        cookie: context.cookie,
        path: "/api/v1/admin/custom-tags",
      }),
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
  .handler(
    ({ context }): Promise<AdminCustomTagCategoriesResponse> =>
      fetchApiJson<AdminCustomTagCategoriesResponse>({
        errorTitle: "Couldn't load custom-tag categories",
        cookie: context.cookie,
        path: "/api/v1/admin/custom-tag-categories",
      }),
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
  .inputValidator((input: { slug: string; label: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create category",
      cookie: context.cookie,
      path: "/api/v1/admin/custom-tag-categories",
      method: "POST",
      body: data,
    });
  });

export function useCreateCustomTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; description?: string | null }) =>
      createCustomTagCategoryFn({ data: vars }),
    invalidates: [queryKeys.admin.customTagCategories, queryKeys.admin.customTags],
  });
}

const updateCustomTagCategoryFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; slug?: string; label?: string; description?: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update category",
      cookie: context.cookie,
      path: `/api/v1/admin/custom-tag-categories/${encodeURIComponent(data.id)}`,
      method: "PATCH",
      body: { slug: data.slug, label: data.label, description: data.description },
    });
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
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete category",
      cookie: context.cookie,
      path: `/api/v1/admin/custom-tag-categories/${encodeURIComponent(data.id)}`,
      method: "DELETE",
    });
  });

export function useDeleteCustomTagCategory() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteCustomTagCategoryFn({ data: { id } }),
    invalidates: [queryKeys.admin.customTagCategories, queryKeys.admin.customTags],
  });
}

// ── Create / update / delete tags ──────────────────────────────────────────

const createCustomTagFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { slug: string; label: string; categoryId: string; description?: string | null }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create custom tag",
      cookie: context.cookie,
      path: "/api/v1/admin/custom-tags",
      method: "POST",
      body: data,
    });
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
  .inputValidator(
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
    await fetchApi({
      errorTitle: "Couldn't update custom tag",
      cookie: context.cookie,
      path: `/api/v1/admin/custom-tags/${encodeURIComponent(data.id)}`,
      method: "PATCH",
      body: {
        slug: data.slug,
        label: data.label,
        categoryId: data.categoryId,
        description: data.description,
      },
    });
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
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete custom tag",
      cookie: context.cookie,
      path: `/api/v1/admin/custom-tags/${encodeURIComponent(data.id)}`,
      method: "DELETE",
    });
  });

export function useDeleteCustomTag() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteCustomTagFn({ data: { id } }),
    invalidates: [queryKeys.admin.customTags, queryKeys.admin.customTagCategories],
  });
}

// ── Per-card assignment ────────────────────────────────────────────────────

const fetchCardCustomTags = createServerFn({ method: "GET" })
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<CardCustomTagsResponse> =>
      fetchApiJson<CardCustomTagsResponse>({
        errorTitle: "Couldn't load card's custom tags",
        cookie: context.cookie,
        path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/custom-tags`,
      }),
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
  .inputValidator((input: { cardId: string; customTagIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't save card's custom tags",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/custom-tags`,
      method: "PUT",
      body: { customTagIds: data.customTagIds },
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
  .inputValidator((input: { tagId: string; cardIds: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<AddCardsToCustomTagResponse> =>
      fetchApiJson<AddCardsToCustomTagResponse>({
        errorTitle: "Couldn't attach cards to tag",
        cookie: context.cookie,
        path: `/api/v1/admin/custom-tags/${encodeURIComponent(data.tagId)}/cards`,
        method: "POST",
        body: { cardIds: data.cardIds },
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
