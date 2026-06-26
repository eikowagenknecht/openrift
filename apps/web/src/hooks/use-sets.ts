import { adminCatalogContract } from "@openrift/shared/contracts";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminSetsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchSets = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminSetsResponse> =>
      apiOrpcClient(adminCatalogContract, context.cookie).listSets(),
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
    await apiOrpcClient(adminCatalogContract, context.cookie).updateSet(data);
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
    await apiOrpcClient(adminCatalogContract, context.cookie).createSet(data);
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
    await apiOrpcClient(adminCatalogContract, context.cookie).deleteSet({ id: data.id });
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
    await apiOrpcClient(adminCatalogContract, context.cookie).reorderSets({ ids: data.ids });
  });

export function useReorderSets() {
  return useMutationWithInvalidation({
    mutationFn: async (ids: string[]) => {
      await reorderSetsFn({ data: { ids } });
    },
    invalidates: [queryKeys.admin.sets],
  });
}
