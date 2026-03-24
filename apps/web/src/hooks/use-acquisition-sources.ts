import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const acquisitionSourcesQueryOptions = queryOptions({
  queryKey: queryKeys.acquisitionSources.all,
  queryFn: () => rpc(client.api["acquisition-sources"].$get()),
  select: (data) => data.sources,
});

export function useAcquisitionSources() {
  return useSuspenseQuery(acquisitionSourcesQueryOptions);
}

export function useCreateAcquisitionSource() {
  return useMutationWithInvalidation({
    mutationFn: (body: { name: string; description?: string | null }) =>
      rpc(client.api["acquisition-sources"].$post({ json: body })),
    invalidates: [queryKeys.acquisitionSources.all],
  });
}

export function useUpdateAcquisitionSource() {
  return useMutationWithInvalidation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string | null }) =>
      rpc(client.api["acquisition-sources"][":id"].$patch({ param: { id }, json: body })),
    invalidates: [queryKeys.acquisitionSources.all],
  });
}

export function useDeleteAcquisitionSource() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) =>
      rpc(client.api["acquisition-sources"][":id"].$delete({ param: { id } })),
    invalidates: [queryKeys.acquisitionSources.all],
  });
}
