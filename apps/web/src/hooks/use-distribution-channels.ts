import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminDistributionChannelsResponse {
  distributionChannels: DistributionChannelResponse[];
}

const fetchChannels = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDistributionChannelsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin["distribution-channels"].$get(),
        "Couldn't load distribution channels",
      ),
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
  .handler(async ({ context, data }): Promise<DistributionChannelResponse> => {
    // The 201 returns `{ distributionChannel }`; unwrap to the bare response the
    // callers expect. (The old fetchApiJson<DistributionChannelResponse> cast
    // lied about this shape — the typed client surfaced it.)
    const body = await callApiJson(
      serverApiClient(context.cookie).api.v1.admin["distribution-channels"].$post({ json: data }),
      "Couldn't create distribution channel",
    );
    return body.distributionChannel;
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
  .inputValidator((input: UpdateChannelInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["distribution-channels"][":id"].$patch({
        param: encodeParams({ id }),
        json: patch,
      }),
      "Couldn't update distribution channel",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["distribution-channels"][":id"].$delete({
        param: encodeParams({ id: data.id }),
        // The route declares a query schema, so hc requires the `query` arg even
        // when empty; `{}` means "no force" → API default (refuse if in use). An
        // empty `{}` adds a harmless trailing `?` to the URL (unavoidable here).
        query: data.force ? { force: "true" } : {},
      }),
      "Couldn't delete distribution channel",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["distribution-channels"].reorder.$put({
        json: { ids: data.ids },
      }),
      "Couldn't reorder distribution channels",
    );
  });

export function useReorderDistributionChannels() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => reorderChannelsFn({ data: { ids } }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}
