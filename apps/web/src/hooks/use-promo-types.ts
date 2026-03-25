import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const adminPromoTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.promoTypes,
  queryFn: async () => {
    const res = await client.api.v1.admin["promo-types"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function usePromoTypes() {
  return useSuspenseQuery(adminPromoTypesQueryOptions);
}

export function useCreatePromoType() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label: string; sortOrder?: number }) => {
      const res = await client.api.v1.admin["promo-types"].$post({ json: vars });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.promoTypes],
  });
}

export function useUpdatePromoType() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { id: string; slug?: string; label?: string; sortOrder?: number }) => {
      const res = await client.api.v1.admin["promo-types"][":id"].$patch({
        param: { id: vars.id },
        json: { slug: vars.slug, label: vars.label, sortOrder: vars.sortOrder },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.promoTypes],
  });
}

export function useReorderPromoTypes() {
  return useMutationWithInvalidation({
    mutationFn: async (ids: string[]) => {
      const res = await client.api.v1.admin["promo-types"].reorder.$put({ json: { ids } });
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
