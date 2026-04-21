import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminLanguagesResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchLanguages = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminLanguagesResponse> =>
      fetchApiJson<AdminLanguagesResponse>({
        errorTitle: "Couldn't load languages",
        cookie: context.cookie,
        path: "/api/v1/admin/languages",
      }),
  );

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
    await fetchApi({
      errorTitle: "Couldn't create language",
      cookie: context.cookie,
      path: "/api/v1/admin/languages",
      method: "POST",
      body: data,
    });
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
    await fetchApi({
      errorTitle: "Couldn't update language",
      cookie: context.cookie,
      path: `/api/v1/admin/languages/${encodeURIComponent(data.code)}`,
      method: "PATCH",
      body: { name: data.name, sortOrder: data.sortOrder },
    });
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
    await fetchApi({
      errorTitle: "Couldn't reorder languages",
      cookie: context.cookie,
      path: "/api/v1/admin/languages/reorder",
      method: "PUT",
      body: { codes: data.codes },
    });
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
    await fetchApi({
      errorTitle: "Couldn't delete language",
      cookie: context.cookie,
      path: `/api/v1/admin/languages/${encodeURIComponent(data.code)}`,
      method: "DELETE",
    });
  });

export function useDeleteLanguage() {
  return useMutationWithInvalidation({
    mutationFn: (code: string) => deleteLanguageFn({ data: { code } }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}
