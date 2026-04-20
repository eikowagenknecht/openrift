import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminDeckFormatsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDeckFormats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminDeckFormatsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/deck-formats`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Deck formats fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminDeckFormatsResponse>;
  });

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
    const res = await fetch(`${API_URL}/api/v1/admin/deck-formats`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create deck format failed: ${res.status}`);
    }
    return res.json();
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/deck-formats/${encodeURIComponent(data.slug)}`,
      {
        method: "PATCH",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ label: data.label }),
      },
    );
    if (!res.ok) {
      throw new Error(`Update deck format failed: ${res.status}`);
    }
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
    const res = await fetch(`${API_URL}/api/v1/admin/deck-formats/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slugs: data.slugs }),
    });
    if (!res.ok) {
      throw new Error(`Reorder deck formats failed: ${res.status}`);
    }
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/deck-formats/${encodeURIComponent(data.slug)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie },
      },
    );
    if (!res.ok) {
      throw new Error(`Delete deck format failed: ${res.status}`);
    }
  });

export function useDeleteDeckFormat() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteDeckFormatFn({ data: { slug } }),
    invalidates: [queryKeys.admin.deckFormats, queryKeys.init.all],
  });
}
