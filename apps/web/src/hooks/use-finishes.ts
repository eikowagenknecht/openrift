import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminFinishesResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchFinishes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminFinishesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.finishes.$get(),
        "Couldn't load finishes",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.finishes.$post({ json: data }),
      "Couldn't create finish",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.finishes[":slug"].$patch({
        param: encodeParams({ slug: data.slug }),
        json: { label: data.label },
      }),
      "Couldn't update finish",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.finishes.reorder.$put({
        json: { slugs: data.slugs },
      }),
      "Couldn't reorder finishes",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.finishes[":slug"].$delete({
        param: encodeParams({ slug: data.slug }),
      }),
      "Couldn't delete finish",
    );
  });

export function useDeleteFinish() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteFinishFn({ data: { slug } }),
    invalidates: [queryKeys.admin.finishes, queryKeys.init.all],
  });
}
