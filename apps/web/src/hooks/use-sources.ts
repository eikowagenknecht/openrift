import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useSources() {
  return useQuery({
    queryKey: queryKeys.sources.all,
    queryFn: () => rpc(client.api.sources.$get()),
  });
}

export function useCreateSource() {
  return useMutationWithInvalidation({
    mutationFn: (body: { name: string; description?: string | null }) =>
      rpc(client.api.sources.$post({ json: body })),
    invalidates: [queryKeys.sources.all],
  });
}

export function useUpdateSource() {
  return useMutationWithInvalidation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string | null }) =>
      rpc(client.api.sources[":id"].$patch({ param: { id }, json: body })),
    invalidates: [queryKeys.sources.all],
  });
}

export function useDeleteSource() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => rpc(client.api.sources[":id"].$delete({ param: { id } })),
    invalidates: [queryKeys.sources.all],
  });
}
