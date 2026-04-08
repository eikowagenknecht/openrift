import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { AdminFinishesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchFinishes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminFinishesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/finishes`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Finishes fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminFinishesResponse>;
  });

export const adminFinishesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.finishes,
  queryFn: () => fetchFinishes(),
});

export function useFinishes() {
  return useSuspenseQuery(adminFinishesQueryOptions);
}

export function useCreateFinish() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label: string }) => {
      const res = await client.api.v1.admin.finishes.$post({ json: vars });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

export function useUpdateFinish() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label?: string }) => {
      const res = await client.api.v1.admin.finishes[":slug"].$patch({
        param: { slug: vars.slug },
        json: { label: vars.label },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

export function useReorderFinishes() {
  return useMutationWithInvalidation({
    mutationFn: async (slugs: string[]) => {
      const res = await client.api.v1.admin.finishes.reorder.$put({ json: { slugs } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

export function useDeleteFinish() {
  return useMutationWithInvalidation({
    mutationFn: async (slug: string) => {
      const res = await client.api.v1.admin.finishes[":slug"].$delete({ param: { slug } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}
