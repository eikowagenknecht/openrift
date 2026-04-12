import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminRaritiesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchRarities = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminRaritiesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/rarities`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Rarities fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminRaritiesResponse>;
  });

export const adminRaritiesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.rarities,
  queryFn: () => fetchRarities(),
});

export function useRarities() {
  return useSuspenseQuery(adminRaritiesQueryOptions);
}

const createRarityFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/rarities`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create rarity failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreateRarity() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; color?: string | null }) =>
      createRarityFn({ data: vars }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const updateRarityFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/rarities/${encodeURIComponent(data.slug)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ label: data.label, color: data.color }),
    });
    if (!res.ok) {
      throw new Error(`Update rarity failed: ${res.status}`);
    }
  });

export function useUpdateRarity() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string; color?: string | null }) =>
      updateRarityFn({ data: vars }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const reorderRaritiesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/rarities/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slugs: data.slugs }),
    });
    if (!res.ok) {
      throw new Error(`Reorder rarities failed: ${res.status}`);
    }
  });

export function useReorderRarities() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderRaritiesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const deleteRarityFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/rarities/${encodeURIComponent(data.slug)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete rarity failed: ${res.status}`);
    }
  });

export function useDeleteRarity() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteRarityFn({ data: { slug } }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}
