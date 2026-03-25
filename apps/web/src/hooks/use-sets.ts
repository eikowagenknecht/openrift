import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const setsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.sets,
  queryFn: async () => {
    const res = await client.api.v1.admin.sets.$get();
    assertOk(res);
    return await res.json();
  },
});

export function useSets() {
  return useSuspenseQuery(setsQueryOptions);
}

export function useUpdateSet() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt: string | null;
    }) => {
      const res = await client.api.v1.admin.sets[":id"].$patch({
        param: { id: body.id },
        json: body,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.sets],
  });
}

export function useCreateSet() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt?: string | null;
    }) => {
      const res = await client.api.v1.admin.sets.$post({ json: body });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.sets],
  });
}

export function useDeleteSet() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin.sets[":id"].$delete({ param: { id } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.sets],
  });
}

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: async (ids: string[]) => {
      const res = await client.api.v1.admin.sets.reorder.$put({ json: { ids } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.sets],
  });
}
