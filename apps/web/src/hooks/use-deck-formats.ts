import type { AdminDeckFormatsResponse } from "@openrift/shared/contracts/admin/deck-formats";
import { adminDeckFormatsContract } from "@openrift/shared/contracts/admin/deck-formats";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDeckFormats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDeckFormatsResponse> =>
      apiOrpcClient(adminDeckFormatsContract, context.cookie).list(),
  );

export const adminDeckFormatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.deckFormats,
  queryFn: () => fetchDeckFormats(),
});

export function useDeckFormats() {
  return useSuspenseQuery(adminDeckFormatsQueryOptions);
}

const createDeckFormatFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDeckFormatsContract, context.cookie).create(data);
  });

export function useCreateDeckFormat() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createDeckFormatFn({ data: vars }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}

const updateDeckFormatFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDeckFormatsContract, context.cookie).update(data);
  });

export function useUpdateDeckFormat() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateDeckFormatFn({ data: vars }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}

const reorderDeckFormatsFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDeckFormatsContract, context.cookie).reorder({ slugs: data.slugs });
  });

export function useReorderDeckFormats() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderDeckFormatsFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}

const deleteDeckFormatFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDeckFormatsContract, context.cookie).remove({ slug: data.slug });
  });

export function useDeleteDeckFormat() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteDeckFormatFn({ data: { slug } }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}
