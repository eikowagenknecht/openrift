import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminCardTypesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchCardTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminCardTypesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/card-types`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Card types fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminCardTypesResponse>;
  });

export const adminCardTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cardTypes,
  queryFn: () => fetchCardTypes(),
});

export function useCardTypes() {
  return useSuspenseQuery(adminCardTypesQueryOptions);
}

const createCardTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/card-types`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create card type failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreateCardType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createCardTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const updateCardTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/card-types/${encodeURIComponent(data.slug)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ label: data.label }),
    });
    if (!res.ok) {
      throw new Error(`Update card type failed: ${res.status}`);
    }
  });

export function useUpdateCardType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateCardTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const reorderCardTypesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/card-types/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slugs: data.slugs }),
    });
    if (!res.ok) {
      throw new Error(`Reorder card types failed: ${res.status}`);
    }
  });

export function useReorderCardTypes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderCardTypesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const deleteCardTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/card-types/${encodeURIComponent(data.slug)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete card type failed: ${res.status}`);
    }
  });

export function useDeleteCardType() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteCardTypeFn({ data: { slug } }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}
