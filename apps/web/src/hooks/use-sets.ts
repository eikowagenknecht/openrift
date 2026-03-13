import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminSet {
  id: string;
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
    queryFn: () => api.get<{ sets: AdminSet[] }>("/api/admin/sets"),
  });
}

export function useUpdateSet() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt: string | null;
    }) => api.patch<{ ok: boolean }>(`/api/admin/sets/${body.id}`, body),
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
    }) => api.post<{ ok: boolean }>("/api/admin/sets", body),
    invalidates: [queryKeys.admin.sets],
  });
}

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => api.put<{ ok: boolean }>("/api/admin/sets/reorder", { ids }),
    invalidates: [queryKeys.admin.sets],
  });
}
