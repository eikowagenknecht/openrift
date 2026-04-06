import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const adminFinishesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.finishes,
  queryFn: async () => {
    const res = await client.api.v1.admin.finishes.$get();
    assertOk(res);
    return await res.json();
  },
});

export function useFinishes() {
  return useSuspenseQuery(adminFinishesQueryOptions);
}

export function useCreateFinish() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label: string }) => {
      const res = await client.api.v1.admin.finishes.$post({ json: vars });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

export function useUpdateFinish() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label?: string }) => {
      const res = await client.api.v1.admin.finishes[":slug"].$patch({
        param: { slug: vars.slug },
        json: { label: vars.label },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

export function useReorderFinishes() {
  return useMutationWithInvalidation({
    mutationFn: async (slugs: string[]) => {
      const res = await client.api.v1.admin.finishes.reorder.$put({ json: { slugs } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

export function useDeleteFinish() {
  return useMutationWithInvalidation({
    mutationFn: async (slug: string) => {
      const res = await client.api.v1.admin.finishes[":slug"].$delete({ param: { slug } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}
