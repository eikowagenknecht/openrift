import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminDeckFormatsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDeckFormats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDeckFormatsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["deck-formats"].$get(),
        "Couldn't load deck formats",
      ),
  );

export const adminDeckFormatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.deckFormats,
  queryFn: () => fetchDeckFormats(),
});

export function useDeckFormats() {
  return useSuspenseQuery(adminDeckFormatsQueryOptions);
}

const createDeckFormatFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["deck-formats"].$post({
        json: data,
      }),
      "Couldn't create deck format",
    );
  });

export function useCreateDeckFormat() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createDeckFormatFn({ data: vars }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}

const updateDeckFormatFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["deck-formats"][":slug"].$patch({
        param: encodeParams({ slug: data.slug }),
        json: { label: data.label },
      }),
      "Couldn't update deck format",
    );
  });

export function useUpdateDeckFormat() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateDeckFormatFn({ data: vars }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}

const reorderDeckFormatsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["deck-formats"].reorder.$put({
        json: { slugs: data.slugs },
      }),
      "Couldn't reorder deck formats",
    );
  });

export function useReorderDeckFormats() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderDeckFormatsFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}

const deleteDeckFormatFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["deck-formats"][":slug"].$delete({
        param: encodeParams({ slug: data.slug }),
      }),
      "Couldn't delete deck format",
    );
  });

export function useDeleteDeckFormat() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteDeckFormatFn({ data: { slug } }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}
