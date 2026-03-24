import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { fetchApi } from "@/lib/server-fns";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const setsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.sets,
  queryFn: () => fetchApi({ data: "/api/admin/sets" }),
});

export function useSets() {
  return useSuspenseQuery(setsQueryOptions);
}

export function useUpdateSet() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt: string | null;
    }) => rpc(client.api.admin.sets[":id"].$patch({ param: { id: body.id }, json: body })),
    invalidates: [queryKeys.admin.sets],
  });
}

export function useCreateSet() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt?: string | null;
    }) => rpc(client.api.admin.sets.$post({ json: body })),
    invalidates: [queryKeys.admin.sets],
  });
}

export function useDeleteSet() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => rpc(client.api.admin.sets[":id"].$delete({ param: { id } })),
    invalidates: [queryKeys.admin.sets],
  });
}

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => rpc(client.api.admin.sets.reorder.$put({ json: { ids } })),
    invalidates: [queryKeys.admin.sets],
  });
}
