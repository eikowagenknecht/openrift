import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const adminPromoTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.promoTypes,
  queryFn: () => rpc(client.api.admin["promo-types"].$get()),
});

export function usePromoTypes() {
  return useSuspenseQuery(adminPromoTypesQueryOptions);
}

export function useCreatePromoType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; sortOrder?: number }) =>
      rpc(client.api.admin["promo-types"].$post({ json: vars })),
    invalidates: [queryKeys.admin.promoTypes],
  });
}

export function useUpdatePromoType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; slug?: string; label?: string; sortOrder?: number }) =>
      rpc(
        client.api.admin["promo-types"][":id"].$patch({
          param: { id: vars.id },
          json: { slug: vars.slug, label: vars.label, sortOrder: vars.sortOrder },
        }),
      ),
    invalidates: [queryKeys.admin.promoTypes],
  });
}

export function useDeletePromoType() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) =>
      rpc(client.api.admin["promo-types"][":id"].$delete({ param: { id } })),
    invalidates: [queryKeys.admin.promoTypes],
  });
}
