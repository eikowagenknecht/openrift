import type { AdminCardTypesResponse } from "@openrift/shared/contracts";
import { adminCardTypesContract } from "@openrift/shared/contracts";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchCardTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminCardTypesResponse> =>
      apiOrpcClient(adminCardTypesContract, context.cookie).list(),
  );

export const adminCardTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cardTypes,
  queryFn: () => fetchCardTypes(),
});

export function useCardTypes() {
  return useSuspenseQuery(adminCardTypesQueryOptions);
}

const createCardTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTypesContract, context.cookie).create(data);
  });

export function useCreateCardType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createCardTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const updateCardTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTypesContract, context.cookie).update(data);
  });

export function useUpdateCardType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateCardTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const reorderCardTypesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTypesContract, context.cookie).reorder({ slugs: data.slugs });
  });

export function useReorderCardTypes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderCardTypesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const deleteCardTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTypesContract, context.cookie).remove({ slug: data.slug });
  });

export function useDeleteCardType() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteCardTypeFn({ data: { slug } }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}
