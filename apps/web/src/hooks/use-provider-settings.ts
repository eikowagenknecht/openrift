import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { ProviderSettingsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchProviderSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<ProviderSettingsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin["provider-settings"].$get(),
        "Couldn't load provider settings",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["provider-settings"].reorder.$put({
        json: { providers: data.providers },
      }),
      "Couldn't reorder provider settings",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["provider-settings"][":provider"].$patch({
        param: encodeParams({ provider: data.provider }),
        json: {
          sortOrder: data.sortOrder,
          isHidden: data.isHidden,
          isFavorite: data.isFavorite,
        },
      }),
      "Couldn't update provider setting",
    );
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
