import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const acquisitionSourcesQueryOptions = queryOptions({
  queryKey: queryKeys.acquisitionSources.all,
  queryFn: async () => {
    const res = await client.api.v1["acquisition-sources"].$get();
    assertOk(res);
    return await res.json();
  },
  select: (data) => data.items,
});

export function useAcquisitionSources() {
  return useSuspenseQuery(acquisitionSourcesQueryOptions);
}

export function useCreateAcquisitionSource() {
  return useMutationWithInvalidation({
    mutationFn: async (body: { name: string; description?: string | null }) => {
      const res = await client.api.v1["acquisition-sources"].$post({ json: body });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.acquisitionSources.all],
  });
}

export function useUpdateAcquisitionSource() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string | null;
    }) => {
      const res = await client.api.v1["acquisition-sources"][":id"].$patch({
        param: { id },
        json: body,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.acquisitionSources.all],
  });
}

export function useDeleteAcquisitionSource() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1["acquisition-sources"][":id"].$delete({ param: { id } });
      assertOk(res);
    },
    invalidates: [queryKeys.acquisitionSources.all],
  });
}
