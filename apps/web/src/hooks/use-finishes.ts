import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminFinishesResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchFinishes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminFinishesResponse> =>
      fetchApiJson<AdminFinishesResponse>({
        errorTitle: "Couldn't load finishes",
        cookie: context.cookie,
        path: "/api/v1/admin/finishes",
      }),
  );

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
    await fetchApi({
      errorTitle: "Couldn't create finish",
      cookie: context.cookie,
      path: "/api/v1/admin/finishes",
      method: "POST",
      body: data,
    });
  });

export function useCreateFinish() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createFinishFn({ data: vars }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}

const updateFinishFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update finish",
      cookie: context.cookie,
      path: `/api/v1/admin/finishes/${encodeURIComponent(data.slug)}`,
      method: "PATCH",
      body: { label: data.label },
    });
  });

export function useUpdateFinish() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateFinishFn({ data: vars }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}

const reorderFinishesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder finishes",
      cookie: context.cookie,
      path: "/api/v1/admin/finishes/reorder",
      method: "PUT",
      body: { slugs: data.slugs },
    });
  });

export function useReorderFinishes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderFinishesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}

const deleteFinishFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete finish",
      cookie: context.cookie,
      path: `/api/v1/admin/finishes/${encodeURIComponent(data.slug)}`,
      method: "DELETE",
    });
  });

export function useDeleteFinish() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteFinishFn({ data: { slug } }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}
