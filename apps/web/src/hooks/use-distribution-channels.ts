import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminDistributionChannelsResponse {
  distributionChannels: DistributionChannelResponse[];
}

const fetchChannels = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDistributionChannelsResponse> =>
      fetchApiJson<AdminDistributionChannelsResponse>({
        errorTitle: "Couldn't load distribution channels",
        cookie: context.cookie,
        path: "/api/v1/admin/distribution-channels",
      }),
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
  .inputValidator((input: CreateChannelInput) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DistributionChannelResponse> =>
      fetchApiJson<DistributionChannelResponse>({
        errorTitle: "Couldn't create distribution channel",
        cookie: context.cookie,
        path: "/api/v1/admin/distribution-channels",
        method: "POST",
        body: data,
      }),
  );

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
  .inputValidator((input: UpdateChannelInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    await fetchApi({
      errorTitle: "Couldn't update distribution channel",
      cookie: context.cookie,
      path: `/api/v1/admin/distribution-channels/${encodeURIComponent(id)}`,
      method: "PATCH",
      body: patch,
    });
  });

export function useUpdateDistributionChannel() {
  return useMutationWithInvalidation({
    mutationFn: (vars: UpdateChannelInput) => updateChannelFn({ data: vars }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}

const deleteChannelFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; force?: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const query = data.force ? "?force=true" : "";
    await fetchApi({
      errorTitle: "Couldn't delete distribution channel",
      cookie: context.cookie,
      path: `/api/v1/admin/distribution-channels/${encodeURIComponent(data.id)}${query}`,
      method: "DELETE",
    });
  });

export function useDeleteDistributionChannel() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { id: string; force?: boolean }) => deleteChannelFn({ data: vars }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}

const reorderChannelsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder distribution channels",
      cookie: context.cookie,
      path: "/api/v1/admin/distribution-channels/reorder",
      method: "PUT",
      body: { ids: data.ids },
    });
  });

export function useReorderDistributionChannels() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => reorderChannelsFn({ data: { ids } }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}
