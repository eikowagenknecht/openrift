import type { Collection } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useCollections() {
  return useQuery({
    queryKey: queryKeys.collections.all,
    queryFn: () => api.get<Collection[]>("/api/collections"),
  });
}

export function useCreateCollection() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
    }) => api.post<Collection>("/api/collections", body),
    invalidates: [queryKeys.collections.all],
  });
}
