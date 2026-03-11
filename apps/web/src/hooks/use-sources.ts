import type { Source } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useSources() {
  return useQuery({
    queryKey: queryKeys.sources.all,
    queryFn: () => api.get<Source[]>("/api/sources"),
  });
}

export function useCreateSource() {
  return useMutationWithInvalidation({
    mutationFn: (body: { name: string; description?: string | null }) =>
      api.post<Source>("/api/sources", body),
    invalidates: [queryKeys.sources.all],
  });
}

export function useUpdateSource() {
  return useMutationWithInvalidation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string | null }) =>
      api.patch<Source>(`/api/sources/${id}`, body),
    invalidates: [queryKeys.sources.all],
  });
}

export function useDeleteSource() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => api.del<void>(`/api/sources/${id}`),
    invalidates: [queryKeys.sources.all],
  });
}
