import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminArtVariantsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchArtVariants = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminArtVariantsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/art-variants`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Art variants fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminArtVariantsResponse>;
  });

export const adminArtVariantsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.artVariants,
  queryFn: () => fetchArtVariants(),
});

export function useArtVariants() {
  return useSuspenseQuery(adminArtVariantsQueryOptions);
}

const createArtVariantFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/art-variants`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create art variant failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreateArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createArtVariantFn({ data: vars }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const updateArtVariantFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/art-variants/${encodeURIComponent(data.slug)}`,
      {
        method: "PATCH",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ label: data.label }),
      },
    );
    if (!res.ok) {
      throw new Error(`Update art variant failed: ${res.status}`);
    }
  });

export function useUpdateArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateArtVariantFn({ data: vars }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const reorderArtVariantsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/art-variants/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slugs: data.slugs }),
    });
    if (!res.ok) {
      throw new Error(`Reorder art variants failed: ${res.status}`);
    }
  });

export function useReorderArtVariants() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderArtVariantsFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const deleteArtVariantFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/art-variants/${encodeURIComponent(data.slug)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie },
      },
    );
    if (!res.ok) {
      throw new Error(`Delete art variant failed: ${res.status}`);
    }
  });

export function useDeleteArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteArtVariantFn({ data: { slug } }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}
