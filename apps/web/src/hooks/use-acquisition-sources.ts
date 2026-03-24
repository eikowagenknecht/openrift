import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { fetchApi } from "@/lib/server-fns";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const acquisitionSourcesQueryOptions = queryOptions({
  queryKey: queryKeys.acquisitionSources.all,
  queryFn: () => fetchApi({ data: "/api/acquisition-sources" }),
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
