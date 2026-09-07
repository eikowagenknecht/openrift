import { adminCatalogContract } from "@openrift/shared/contracts/admin/catalog";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import type { AdminSetsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

type CreateSetInput = ContractInput<typeof adminCatalogContract, "createSet">;
type UpdateSetInput = ContractInput<typeof adminCatalogContract, "updateSet">;

const fetchSets = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminSetsResponse> =>
    apiOrpcClient(adminCatalogContract, context.cookie).listSets(),
  );

const createSetFn = createServerFn({ method: "POST" })
  .validator((input: CreateSetInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCatalogContract, context.cookie).createSet(data);
  });

const updateSetFn = createServerFn({ method: "POST" })
  .validator((input: UpdateSetInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCatalogContract, context.cookie).updateSet(data);
  });

const reorderSetsFn = createServerFn({ method: "POST" })
  .validator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCatalogContract, context.cookie).reorderSets({ ids: data.ids });
  });

const deleteSetFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCatalogContract, context.cookie).deleteSet({ id: data.id });
  });

const setHooks = createAdminEnumHooks({
  queryKey: adminKeys.sets,
  list: () => fetchSets(),
  invalidates: [adminKeys.sets],
  create: (vars: CreateSetInput) => createSetFn({ data: vars }),
  update: (vars: UpdateSetInput) => updateSetFn({ data: vars }),
  reorder: (ids: string[]) => reorderSetsFn({ data: { ids } }),
  remove: (id: string) => deleteSetFn({ data: { id } }),
});

export const setsQueryOptions = setHooks.queryOptions;
export const useSets = setHooks.useList;
export const useUpdateSet = setHooks.useUpdate;
export const useCreateSet = setHooks.useCreate;
export const useDeleteSet = setHooks.useDelete;
export const useReorderSets = setHooks.useReorder;
