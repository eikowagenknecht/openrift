import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminDistributionChannelsResponse {
  distributionChannels: DistributionChannelResponse[];
}

const fetchChannels = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminDistributionChannelsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/distribution-channels`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Distribution channels fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminDistributionChannelsResponse>;
  });

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
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/distribution-channels`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Create distribution channel failed: ${res.status}`);
    }
    return res.json();
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/distribution-channels/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Update distribution channel failed: ${res.status}`);
    }
  });

export function useUpdateDistributionChannel() {
  return useMutationWithInvalidation({
    mutationFn: (vars: UpdateChannelInput) => updateChannelFn({ data: vars }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}

const deleteChannelFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/distribution-channels/${encodeURIComponent(data.id)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie },
      },
    );
    if (!res.ok) {
      throw new Error(`Delete distribution channel failed: ${res.status}`);
    }
  });

export function useDeleteDistributionChannel() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteChannelFn({ data: { id } }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}

const reorderChannelsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/distribution-channels/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ ids: data.ids }),
    });
    if (!res.ok) {
      throw new Error(`Reorder distribution channels failed: ${res.status}`);
    }
  });

export function useReorderDistributionChannels() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => reorderChannelsFn({ data: { ids } }),
    invalidates: [queryKeys.admin.distributionChannels, queryKeys.promos.all],
  });
}
