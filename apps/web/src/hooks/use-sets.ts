import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminSetsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchSets = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminSetsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/sets`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Sets fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminSetsResponse>;
  });

export const setsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.sets,
  queryFn: () => fetchSets(),
});

export function useSets() {
  return useSuspenseQuery(setsQueryOptions);
}

const updateSetFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; name: string; printedTotal: number; releasedAt: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/sets/${encodeURIComponent(data.id)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Update set failed: ${res.status}`);
    }
  });

export function useUpdateSet() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt: string | null;
    }) => {
      await updateSetFn({ data: body });
    },
    invalidates: [queryKeys.admin.sets],
  });
}

const createSetFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; name: string; printedTotal: number; releasedAt?: string | null }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/sets`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create set failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreateSet() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt?: string | null;
    }) => createSetFn({ data: body }),
    invalidates: [queryKeys.admin.sets],
  });
}

const deleteSetFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/sets/${encodeURIComponent(data.id)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete set failed: ${res.status}`);
    }
  });

export function useDeleteSet() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      await deleteSetFn({ data: { id } });
    },
    invalidates: [queryKeys.admin.sets],
  });
}

const reorderSetsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/sets/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ ids: data.ids }),
    });
    if (!res.ok) {
      throw new Error(`Reorder sets failed: ${res.status}`);
    }
  });

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: async (ids: string[]) => {
      await reorderSetsFn({ data: { ids } });
    },
    invalidates: [queryKeys.admin.sets],
  });
}
