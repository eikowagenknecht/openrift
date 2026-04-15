import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
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
  staleTime: 30 * 60 * 1000,
});

export function useLanguages() {
  return useSuspenseQuery(adminLanguagesQueryOptions);
}

const createLanguageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; name: string; sortOrder?: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/languages`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create language failed: ${res.status}`);
    }
    return res.json();
  });

export function useCreateLanguage() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { code: string; name: string; sortOrder?: number }) =>
      createLanguageFn({ data: vars }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}

const updateLanguageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; name?: string; sortOrder?: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/languages/${encodeURIComponent(data.code)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: data.name, sortOrder: data.sortOrder }),
    });
    if (!res.ok) {
      throw new Error(`Update language failed: ${res.status}`);
    }
  });

export function useUpdateLanguage() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { code: string; name?: string; sortOrder?: number }) =>
      updateLanguageFn({ data: vars }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}

const reorderLanguagesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { codes: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/languages/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ codes: data.codes }),
    });
    if (!res.ok) {
      throw new Error(`Reorder languages failed: ${res.status}`);
    }
  });

export function useReorderLanguages() {
  return useMutationWithInvalidation({
    mutationFn: (codes: string[]) => reorderLanguagesFn({ data: { codes } }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}

const deleteLanguageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/languages/${encodeURIComponent(data.code)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete language failed: ${res.status}`);
    }
  });

export function useDeleteLanguage() {
  return useMutationWithInvalidation({
    mutationFn: (code: string) => deleteLanguageFn({ data: { code } }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}
