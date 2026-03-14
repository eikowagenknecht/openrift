import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminSet {
  id: string;
  slug: string;
  name: string;
  printedTotal: number;
  sortOrder: number;
  releasedAt: string | null;
  cardCount: number;
  printingCount: number;
}

export function useSets() {
  return useQuery({
    queryKey: queryKeys.admin.sets,
    queryFn: () => rpc<{ sets: AdminSet[] }>(client.api.admin.sets.$get()),
  });
}

export function useUpdateSet() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt: string | null;
    }) =>
      rpc<{ ok: boolean }>(
        client.api.admin.sets[":id"].$patch({ param: { id: body.id }, json: body }),
      ),
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
    }) => rpc<{ ok: boolean }>(client.api.admin.sets.$post({ json: body })),
    invalidates: [queryKeys.admin.sets],
  });
}

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) =>
      rpc<{ ok: boolean }>(client.api.admin.sets.reorder.$put({ json: { ids } })),
    invalidates: [queryKeys.admin.sets],
  });
}
