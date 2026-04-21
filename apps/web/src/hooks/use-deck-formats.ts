import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminDeckFormatsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDeckFormats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDeckFormatsResponse> =>
      fetchApiJson<AdminDeckFormatsResponse>({
        errorTitle: "Couldn't load deck formats",
        cookie: context.cookie,
        path: "/api/v1/admin/deck-formats",
      }),
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
    await fetchApi({
      errorTitle: "Couldn't create deck format",
      cookie: context.cookie,
      path: "/api/v1/admin/deck-formats",
      method: "POST",
      body: data,
    });
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
    await fetchApi({
      errorTitle: "Couldn't update deck format",
      cookie: context.cookie,
      path: `/api/v1/admin/deck-formats/${encodeURIComponent(data.slug)}`,
      method: "PATCH",
      body: { label: data.label },
    });
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
    await fetchApi({
      errorTitle: "Couldn't reorder deck formats",
      cookie: context.cookie,
      path: "/api/v1/admin/deck-formats/reorder",
      method: "PUT",
      body: { slugs: data.slugs },
    });
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
    await fetchApi({
      errorTitle: "Couldn't delete deck format",
      cookie: context.cookie,
      path: `/api/v1/admin/deck-formats/${encodeURIComponent(data.slug)}`,
      method: "DELETE",
    });
  });

export function useDeleteDeckFormat() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteDeckFormatFn({ data: { slug } }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}
