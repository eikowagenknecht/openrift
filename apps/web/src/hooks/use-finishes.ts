import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
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

const createFinishFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/finishes`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create finish failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreateFinish() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createFinishFn({ data: vars }),
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

const updateFinishFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/finishes/${encodeURIComponent(data.slug)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ label: data.label }),
    });
    if (!res.ok) {
      throw new Error(`Update finish failed: ${res.status}`);
    }
  });

export function useUpdateFinish() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateFinishFn({ data: vars }),
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

const reorderFinishesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/finishes/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slugs: data.slugs }),
    });
    if (!res.ok) {
      throw new Error(`Reorder finishes failed: ${res.status}`);
    }
  });

export function useReorderFinishes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderFinishesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}

const deleteFinishFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/finishes/${encodeURIComponent(data.slug)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete finish failed: ${res.status}`);
    }
  });

export function useDeleteFinish() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteFinishFn({ data: { slug } }),
    invalidates: [queryKeys.admin.finishes, queryKeys.enums.all],
  });
}
