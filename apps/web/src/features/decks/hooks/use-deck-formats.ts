import type { AdminDeckFormatsResponse } from "@openrift/shared/contracts/admin/deck-formats";
import { adminDeckFormatsContract } from "@openrift/shared/contracts/admin/deck-formats";
import { createServerFn } from "@tanstack/react-start";

import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchDeckFormats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminDeckFormatsResponse> =>
    apiOrpcClient(adminDeckFormatsContract, context.cookie).list(),
  );

const createDeckFormatFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDeckFormatsContract, context.cookie).create(data);
  });

const updateDeckFormatFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDeckFormatsContract, context.cookie).update(data);
  });

const reorderDeckFormatsFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDeckFormatsContract, context.cookie).reorder({ slugs: data.slugs });
  });

const deleteDeckFormatFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDeckFormatsContract, context.cookie).remove({ slug: data.slug });
  });

const deckFormatHooks = createAdminEnumHooks({
  queryKey: queryKeys.admin.deckFormats,
  list: () => fetchDeckFormats(),
  invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  create: (vars: { slug: string; label: string }) => createDeckFormatFn({ data: vars }),
  update: (vars: { slug: string; label?: string }) => updateDeckFormatFn({ data: vars }),
  reorder: (slugs: string[]) => reorderDeckFormatsFn({ data: { slugs } }),
  remove: (slug: string) => deleteDeckFormatFn({ data: { slug } }),
});

export const adminDeckFormatsQueryOptions = deckFormatHooks.queryOptions;
export const useDeckFormats = deckFormatHooks.useList;
export const useCreateDeckFormat = deckFormatHooks.useCreate;
export const useUpdateDeckFormat = deckFormatHooks.useUpdate;
export const useReorderDeckFormats = deckFormatHooks.useReorder;
export const useDeleteDeckFormat = deckFormatHooks.useDelete;
