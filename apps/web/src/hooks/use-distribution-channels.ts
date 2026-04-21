import type { DistributionChannelKind, DistributionChannelResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
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

// TODO: migrate to fetchApi — surfaces server-generated error text as the
// user-facing toast, which the helper would replace with the generic errorTitle.
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

// TODO: migrate to fetchApi — surfaces server-generated error text as the
// user-facing toast, which the helper would replace with the generic errorTitle.
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

// TODO: migrate to fetchApi — extracts `body.error` from API response and
// surfaces it as the user-facing toast, which the helper would replace with the
// generic errorTitle.
const deleteChannelFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; force?: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const query = data.force ? "?force=true" : "";
    const res = await fetch(
      `${API_URL}/api/v1/admin/distribution-channels/${encodeURIComponent(data.id)}${query}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie },
      },
    );
    if (!res.ok) {
      const text = await res.text();
      let message = `Delete distribution channel failed: ${res.status}`;
      try {
        const body = JSON.parse(text) as { error?: string };
        if (body.error) {
          message = body.error;
        }
      } catch {
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }
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
