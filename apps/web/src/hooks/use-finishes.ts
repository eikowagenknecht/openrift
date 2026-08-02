import type { AdminFinishesResponse } from "@openrift/shared/contracts/admin/finishes";
import { adminFinishesContract } from "@openrift/shared/contracts/admin/finishes";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchFinishes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminFinishesResponse> =>
      apiOrpcClient(adminFinishesContract, context.cookie).list(),
  );

export const adminFinishesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.finishes,
  queryFn: () => fetchFinishes(),
});

export function useFinishes() {
  return useSuspenseQuery(adminFinishesQueryOptions);
}

const createFinishFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFinishesContract, context.cookie).create(data);
  });

export function useCreateFinish() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createFinishFn({ data: vars }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}

const updateFinishFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFinishesContract, context.cookie).update(data);
  });

export function useUpdateFinish() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateFinishFn({ data: vars }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}

const reorderFinishesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFinishesContract, context.cookie).reorder({ slugs: data.slugs });
  });

export function useReorderFinishes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderFinishesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}

const deleteFinishFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFinishesContract, context.cookie).remove({ slug: data.slug });
  });

export function useDeleteFinish() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteFinishFn({ data: { slug } }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}
