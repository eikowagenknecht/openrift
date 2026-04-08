import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminPromoTypesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchPromoTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminPromoTypesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/promo-types`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Promo types fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminPromoTypesResponse>;
  });

export const adminPromoTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.promoTypes,
  queryFn: () => fetchPromoTypes(),
});

export function usePromoTypes() {
  return useSuspenseQuery(adminPromoTypesQueryOptions);
}

const createPromoTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/promo-types`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create promo type failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreatePromoType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createPromoTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.promoTypes],
  });
}

const updatePromoTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; slug?: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/promo-types/${encodeURIComponent(data.id)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slug: data.slug, label: data.label }),
    });
    if (!res.ok) {
      throw new Error(`Update promo type failed: ${res.status}`);
    }
  });

export function useUpdatePromoType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; slug?: string; label?: string }) =>
      updatePromoTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.promoTypes],
  });
}

const deletePromoTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/promo-types/${encodeURIComponent(data.id)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete promo type failed: ${res.status}`);
    }
  });

export function useDeletePromoType() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deletePromoTypeFn({ data: { id } }),
    invalidates: [queryKeys.admin.promoTypes],
  });
}
