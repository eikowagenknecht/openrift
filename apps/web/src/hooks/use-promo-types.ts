import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
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

export function useCreatePromoType() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label: string }) => {
      const res = await client.api.v1.admin["promo-types"].$post({ json: vars });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.promoTypes],
  });
}

export function useUpdatePromoType() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { id: string; slug?: string; label?: string }) => {
      const res = await client.api.v1.admin["promo-types"][":id"].$patch({
        param: { id: vars.id },
        json: { slug: vars.slug, label: vars.label },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.promoTypes],
  });
}

export function useDeletePromoType() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin["promo-types"][":id"].$delete({ param: { id } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.promoTypes],
  });
}
