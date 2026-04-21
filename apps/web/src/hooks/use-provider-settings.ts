import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { ProviderSettingsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchProviderSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<ProviderSettingsResponse> =>
      fetchApiJson<ProviderSettingsResponse>({
        errorTitle: "Couldn't load provider settings",
        cookie: context.cookie,
        path: "/api/v1/admin/provider-settings",
      }),
  );

export const providerSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.providerSettings,
  queryFn: () => fetchProviderSettings(),
  staleTime: 30 * 60 * 1000,
});

export function useProviderSettings() {
  return useSuspenseQuery(providerSettingsQueryOptions);
}

const reorderProviderSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { providers: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder provider settings",
      cookie: context.cookie,
      path: "/api/v1/admin/provider-settings/reorder",
      method: "PUT",
      body: { providers: data.providers },
    });
  });

export function useReorderProviderSettings() {
  return useMutationWithInvalidation({
    mutationFn: async (providers: string[]) => {
      await reorderProviderSettingsFn({ data: { providers } });
    },
    invalidates: [queryKeys.admin.providerSettings],
  });
}

const updateProviderSettingFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { provider: string; sortOrder?: number; isHidden?: boolean; isFavorite?: boolean }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update provider setting",
      cookie: context.cookie,
      path: `/api/v1/admin/provider-settings/${encodeURIComponent(data.provider)}`,
      method: "PATCH",
      body: {
        sortOrder: data.sortOrder,
        isHidden: data.isHidden,
        isFavorite: data.isFavorite,
      },
    });
  });

export function useUpdateProviderSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: {
      provider: string;
      sortOrder?: number;
      isHidden?: boolean;
      isFavorite?: boolean;
    }) => {
      await updateProviderSettingFn({ data: vars });
    },
    invalidates: [queryKeys.admin.providerSettings, queryKeys.admin.cards.list],
  });
}
