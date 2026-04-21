import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminSetsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchSets = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminSetsResponse> =>
      fetchApiJson<AdminSetsResponse>({
        errorTitle: "Couldn't load sets",
        cookie: context.cookie,
        path: "/api/v1/admin/sets",
      }),
  );

export const setsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.sets,
  queryFn: () => fetchSets(),
});

export function useSets() {
  return useSuspenseQuery(setsQueryOptions);
}

const updateSetFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt: string | null;
      released: boolean;
      setType: "main" | "supplemental";
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update set",
      cookie: context.cookie,
      path: `/api/v1/admin/sets/${encodeURIComponent(data.id)}`,
      method: "PATCH",
      body: data,
    });
  });

export function useUpdateSet() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      id: string;
      name: string;
      printedTotal: number;
      releasedAt: string | null;
      released: boolean;
      setType: "main" | "supplemental";
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
    await fetchApi({
      errorTitle: "Couldn't create set",
      cookie: context.cookie,
      path: "/api/v1/admin/sets",
      method: "POST",
      body: data,
    });
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
    await fetchApi({
      errorTitle: "Couldn't delete set",
      cookie: context.cookie,
      path: `/api/v1/admin/sets/${encodeURIComponent(data.id)}`,
      method: "DELETE",
    });
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
    await fetchApi({
      errorTitle: "Couldn't reorder sets",
      cookie: context.cookie,
      path: "/api/v1/admin/sets/reorder",
      method: "PUT",
      body: { ids: data.ids },
    });
  });

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: async (ids: string[]) => {
      await reorderSetsFn({ data: { ids } });
    },
    invalidates: [queryKeys.admin.sets],
  });
}
