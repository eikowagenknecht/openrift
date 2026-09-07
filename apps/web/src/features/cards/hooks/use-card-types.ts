import type { AdminCardTypesResponse } from "@openrift/shared/contracts/admin/card-types";
import { adminCardTypesContract } from "@openrift/shared/contracts/admin/card-types";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import { initKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchCardTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminCardTypesResponse> =>
    apiOrpcClient(adminCardTypesContract, context.cookie).list(),
  );

const createCardTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTypesContract, context.cookie).create(data);
  });

const updateCardTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTypesContract, context.cookie).update(data);
  });

const reorderCardTypesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTypesContract, context.cookie).reorder({ slugs: data.slugs });
  });

const deleteCardTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardTypesContract, context.cookie).remove({ slug: data.slug });
  });

const cardTypeHooks = createAdminEnumHooks({
  queryKey: adminKeys.cardTypes,
  list: () => fetchCardTypes(),
  invalidates: [adminKeys.cardTypes, initKeys.all],
  create: (vars: { slug: string; label: string }) => createCardTypeFn({ data: vars }),
  update: (vars: { slug: string; label?: string }) => updateCardTypeFn({ data: vars }),
  reorder: (slugs: string[]) => reorderCardTypesFn({ data: { slugs } }),
  remove: (slug: string) => deleteCardTypeFn({ data: { slug } }),
});

export const adminCardTypesQueryOptions = cardTypeHooks.queryOptions;
export const useCardTypes = cardTypeHooks.useList;
export const useCreateCardType = cardTypeHooks.useCreate;
export const useUpdateCardType = cardTypeHooks.useUpdate;
export const useReorderCardTypes = cardTypeHooks.useReorder;
export const useDeleteCardType = cardTypeHooks.useDelete;
