import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminLanguagesResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchLanguages = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminLanguagesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin.languages.$get(),
        "Couldn't load languages",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.languages.$post({
        json: data,
      }),
      "Couldn't create language",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.languages[":code"].$patch({
        param: encodeParams({ code: data.code }),
        json: { name: data.name, sortOrder: data.sortOrder },
      }),
      "Couldn't update language",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.languages.reorder.$put({
        json: { codes: data.codes },
      }),
      "Couldn't reorder languages",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.languages[":code"].$delete({
        param: encodeParams({ code: data.code }),
      }),
      "Couldn't delete language",
    );
  });

export function useDeleteLanguage() {
  return useMutationWithInvalidation({
    mutationFn: (code: string) => deleteLanguageFn({ data: { code } }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}
