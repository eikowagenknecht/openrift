import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
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

export function useUpdateSet() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt: string | null;
    }) => {
      const res = await client.api.v1.admin.sets[":id"].$patch({
        param: { id: body.id },
        json: body,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.sets],
  });
}

export function useCreateSet() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt?: string | null;
    }) => {
      const res = await client.api.v1.admin.sets.$post({ json: body });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.sets],
  });
}

export function useDeleteSet() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin.sets[":id"].$delete({ param: { id } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.sets],
  });
}

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: async (ids: string[]) => {
      const res = await client.api.v1.admin.sets.reorder.$put({ json: { ids } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.sets],
  });
}
