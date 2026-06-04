import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminDomainsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDomains = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDomainsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.domains.$get(),
        "Couldn't load domains",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.domains.$post({
        json: data,
      }),
      "Couldn't create domain",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.domains[":slug"].$patch({
        param: encodeParams({ slug: data.slug }),
        json: { label: data.label, color: data.color },
      }),
      "Couldn't update domain",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.domains.reorder.$put({
        json: { slugs: data.slugs },
      }),
      "Couldn't reorder domains",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.domains[":slug"].$delete({
        param: encodeParams({ slug: data.slug }),
      }),
      "Couldn't delete domain",
    );
  });

export function useDeleteDomain() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteDomainFn({ data: { slug } }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}
