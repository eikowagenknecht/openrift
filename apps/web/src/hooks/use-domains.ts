import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminDomainsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDomains = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminDomainsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/domains`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Domains fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminDomainsResponse>;
  });

export const adminDomainsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.domains,
  queryFn: () => fetchDomains(),
});

export function useDomains() {
  return useSuspenseQuery(adminDomainsQueryOptions);
}

const createDomainFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/domains`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create domain failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreateDomain() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; color?: string | null }) =>
      createDomainFn({ data: vars }),
    invalidates: [queryKeys.admin.domains, queryKeys.enums.all],
  });
}

const updateDomainFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/domains/${encodeURIComponent(data.slug)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ label: data.label, color: data.color }),
    });
    if (!res.ok) {
      throw new Error(`Update domain failed: ${res.status}`);
    }
  });

export function useUpdateDomain() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string; color?: string | null }) =>
      updateDomainFn({ data: vars }),
    invalidates: [queryKeys.admin.domains, queryKeys.enums.all],
  });
}

const reorderDomainsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/domains/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slugs: data.slugs }),
    });
    if (!res.ok) {
      throw new Error(`Reorder domains failed: ${res.status}`);
    }
  });

export function useReorderDomains() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderDomainsFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.domains, queryKeys.enums.all],
  });
}

const deleteDomainFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/domains/${encodeURIComponent(data.slug)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete domain failed: ${res.status}`);
    }
  });

export function useDeleteDomain() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteDomainFn({ data: { slug } }),
    invalidates: [queryKeys.admin.domains, queryKeys.enums.all],
  });
}
