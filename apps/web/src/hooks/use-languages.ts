import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { AdminLanguagesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchLanguages = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminLanguagesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/languages`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Languages fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminLanguagesResponse>;
  });

export const adminLanguagesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.languages,
  queryFn: () => fetchLanguages(),
});

export function useLanguages() {
  return useSuspenseQuery(adminLanguagesQueryOptions);
}

export function useCreateLanguage() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { code: string; name: string; sortOrder?: number }) => {
      const res = await client.api.v1.admin.languages.$post({ json: vars });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.languages],
  });
}

export function useUpdateLanguage() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { code: string; name?: string; sortOrder?: number }) => {
      const res = await client.api.v1.admin.languages[":code"].$patch({
        param: { code: vars.code },
        json: { name: vars.name, sortOrder: vars.sortOrder },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.languages],
  });
}

export function useReorderLanguages() {
  return useMutationWithInvalidation({
    mutationFn: async (codes: string[]) => {
      const res = await client.api.v1.admin.languages.reorder.$put({ json: { codes } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.languages],
  });
}

export function useDeleteLanguage() {
  return useMutationWithInvalidation({
    mutationFn: async (code: string) => {
      const res = await client.api.v1.admin.languages[":code"].$delete({ param: { code } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.languages],
  });
}
