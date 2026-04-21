import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminDomainsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDomains = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDomainsResponse> =>
      fetchApiJson<AdminDomainsResponse>({
        errorTitle: "Couldn't load domains",
        cookie: context.cookie,
        path: "/api/v1/admin/domains",
      }),
  );

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
    await fetchApi({
      errorTitle: "Couldn't create domain",
      cookie: context.cookie,
      path: "/api/v1/admin/domains",
      method: "POST",
      body: data,
    });
  });

export function useCreateDomain() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; color?: string | null }) =>
      createDomainFn({ data: vars }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}

const updateDomainFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update domain",
      cookie: context.cookie,
      path: `/api/v1/admin/domains/${encodeURIComponent(data.slug)}`,
      method: "PATCH",
      body: { label: data.label, color: data.color },
    });
  });

export function useUpdateDomain() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string; color?: string | null }) =>
      updateDomainFn({ data: vars }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}

const reorderDomainsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder domains",
      cookie: context.cookie,
      path: "/api/v1/admin/domains/reorder",
      method: "PUT",
      body: { slugs: data.slugs },
    });
  });

export function useReorderDomains() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderDomainsFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}

const deleteDomainFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete domain",
      cookie: context.cookie,
      path: `/api/v1/admin/domains/${encodeURIComponent(data.slug)}`,
      method: "DELETE",
    });
  });

export function useDeleteDomain() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteDomainFn({ data: { slug } }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}
