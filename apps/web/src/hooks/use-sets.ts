import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminSetsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchSets = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminSetsResponse> =>
      callApiJson(serverApiClient(context.cookie).api.admin.v1.sets.$get(), "Couldn't load sets"),
  );

export const setsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.sets,
  queryFn: () => fetchSets(),
});

export function useSets() {
  return useSuspenseQuery(setsQueryOptions);
}

const updateSetFn = createServerFn({ method: "POST" })
  .validator(
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
    const { id, ...patch } = data;
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.sets[":id"].$patch({
        param: encodeParams({ id }),
        json: patch,
      }),
      "Couldn't update set",
    );
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
  .validator(
    (input: { id: string; name: string; printedTotal: number; releasedAt?: string | null }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.sets.$post({
        json: data,
      }),
      "Couldn't create set",
    );
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
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.sets[":id"].$delete({
        param: encodeParams({ id: data.id }),
      }),
      "Couldn't delete set",
    );
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
  .validator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.sets.reorder.$put({
        json: { ids: data.ids },
      }),
      "Couldn't reorder sets",
    );
  });

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: async (ids: string[]) => {
      await reorderSetsFn({ data: { ids } });
    },
    invalidates: [queryKeys.admin.sets],
  });
}
