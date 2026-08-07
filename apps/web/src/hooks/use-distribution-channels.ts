import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";
import type { AdminDistributionChannelsResponse } from "@openrift/shared/contracts/admin/distribution-channels";
import { adminDistributionChannelsContract } from "@openrift/shared/contracts/admin/distribution-channels";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchChannels = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminDistributionChannelsResponse> =>
    apiOrpcClient(adminDistributionChannelsContract, context.cookie).list(),
  );

export const adminDistributionChannelsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.distributionChannels,
  queryFn: () => fetchChannels(),
  staleTime: 30 * 60 * 1000,
});

export function useDistributionChannels() {
  return useSuspenseQuery(adminDistributionChannelsQueryOptions);
}

interface CreateChannelInput {
  slug: string;
  label: string;
  description?: string | null;
  kind?: DistributionChannelKind;
  parentId?: string | null;
  childrenLabel?: string | null;
}

const createChannelFn = createServerFn({ method: "POST" })
  .validator((input: CreateChannelInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<DistributionChannelResponse> => {
    // The 201 returns `{ distributionChannel }`; unwrap to the bare response the
    // callers expect.
    const { distributionChannel } = await apiOrpcClient(
      adminDistributionChannelsContract,
      context.cookie,
    ).create(data);
    return distributionChannel;
  });

export function useCreateDistributionChannel() {
  return useMutationWithInvalidation({
    mutationFn: (vars: CreateChannelInput) => createChannelFn({ data: vars }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}

interface UpdateChannelInput {
  id: string;
  slug?: string;
  label?: string;
  description?: string | null;
  kind?: DistributionChannelKind;
  parentId?: string | null;
  childrenLabel?: string | null;
}

const updateChannelFn = createServerFn({ method: "POST" })
  .validator((input: UpdateChannelInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDistributionChannelsContract, context.cookie).update(data);
  });

export function useUpdateDistributionChannel() {
  return useMutationWithInvalidation({
    mutationFn: (vars: UpdateChannelInput) => updateChannelFn({ data: vars }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}

const deleteChannelFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; force?: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDistributionChannelsContract, context.cookie).remove({
      params: { id: data.id },
      query: { force: data.force ? "true" : undefined },
    });
  });

export function useDeleteDistributionChannel() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; force?: boolean }) => deleteChannelFn({ data: vars }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}

const reorderChannelsFn = createServerFn({ method: "POST" })
  .validator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDistributionChannelsContract, context.cookie).reorder({
      ids: data.ids,
    });
  });

export function useReorderDistributionChannels() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => reorderChannelsFn({ data: { ids } }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}
