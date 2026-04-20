import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminSuperTypesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchSuperTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminSuperTypesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/super-types`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Super types fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminSuperTypesResponse>;
  });

export const adminSuperTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.superTypes,
  queryFn: () => fetchSuperTypes(),
});

export function useSuperTypes() {
  return useSuspenseQuery(adminSuperTypesQueryOptions);
}

const createSuperTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/super-types`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create super type failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreateSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createSuperTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const updateSuperTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/super-types/${encodeURIComponent(data.slug)}`,
      {
        method: "PATCH",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ label: data.label }),
      },
    );
    if (!res.ok) {
      throw new Error(`Update super type failed: ${res.status}`);
    }
  });

export function useUpdateSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateSuperTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const reorderSuperTypesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/super-types/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slugs: data.slugs }),
    });
    if (!res.ok) {
      throw new Error(`Reorder super types failed: ${res.status}`);
    }
  });

export function useReorderSuperTypes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderSuperTypesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const deleteSuperTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/super-types/${encodeURIComponent(data.slug)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie },
      },
    );
    if (!res.ok) {
      throw new Error(`Delete super type failed: ${res.status}`);
    }
  });

export function useDeleteSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteSuperTypeFn({ data: { slug } }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}
