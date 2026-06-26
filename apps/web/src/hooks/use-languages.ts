import type { AdminLanguagesResponse } from "@openrift/shared/contracts";
import { adminLanguagesContract } from "@openrift/shared/contracts";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchLanguages = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminLanguagesResponse> =>
      apiOrpcClient(adminLanguagesContract, context.cookie).list(),
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
  .validator((input: { code: string; name: string; sortOrder?: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminLanguagesContract, context.cookie).create(data);
  });

export function useCreateLanguage() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { code: string; name: string; sortOrder?: number }) =>
      createLanguageFn({ data: vars }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}

const updateLanguageFn = createServerFn({ method: "POST" })
  .validator((input: { code: string; name?: string; sortOrder?: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminLanguagesContract, context.cookie).update(data);
  });

export function useUpdateLanguage() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { code: string; name?: string; sortOrder?: number }) =>
      updateLanguageFn({ data: vars }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}

const reorderLanguagesFn = createServerFn({ method: "POST" })
  .validator((input: { codes: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminLanguagesContract, context.cookie).reorder({ codes: data.codes });
  });

export function useReorderLanguages() {
  return useMutationWithInvalidation({
    mutationFn: (codes: string[]) => reorderLanguagesFn({ data: { codes } }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}

const deleteLanguageFn = createServerFn({ method: "POST" })
  .validator((input: { code: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminLanguagesContract, context.cookie).remove({ code: data.code });
  });

export function useDeleteLanguage() {
  return useMutationWithInvalidation({
    mutationFn: (code: string) => deleteLanguageFn({ data: { code } }),
    invalidates: [queryKeys.admin.languages, queryKeys.init.all],
  });
}
