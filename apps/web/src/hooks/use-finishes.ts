import type { AdminFinishesResponse } from "@openrift/shared/contracts/admin/finishes";
import { adminFinishesContract } from "@openrift/shared/contracts/admin/finishes";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import { initKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchFinishes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminFinishesResponse> =>
    apiOrpcClient(adminFinishesContract, context.cookie).list(),
  );

const createFinishFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFinishesContract, context.cookie).create(data);
  });

const updateFinishFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFinishesContract, context.cookie).update(data);
  });

const reorderFinishesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFinishesContract, context.cookie).reorder({ slugs: data.slugs });
  });

const deleteFinishFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFinishesContract, context.cookie).remove({ slug: data.slug });
  });

const finishHooks = createAdminEnumHooks({
  queryKey: adminKeys.finishes,
  list: () => fetchFinishes(),
  invalidates: [adminKeys.finishes, initKeys.all],
  create: (vars: { slug: string; label: string }) => createFinishFn({ data: vars }),
  update: (vars: { slug: string; label?: string }) => updateFinishFn({ data: vars }),
  reorder: (slugs: string[]) => reorderFinishesFn({ data: { slugs } }),
  remove: (slug: string) => deleteFinishFn({ data: { slug } }),
});

export const adminFinishesQueryOptions = finishHooks.queryOptions;
export const useFinishes = finishHooks.useList;
export const useCreateFinish = finishHooks.useCreate;
export const useUpdateFinish = finishHooks.useUpdate;
export const useReorderFinishes = finishHooks.useReorder;
export const useDeleteFinish = finishHooks.useDelete;
