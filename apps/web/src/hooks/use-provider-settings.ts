import type { ProviderSettingsResponse } from "@openrift/shared/contracts/admin/provider-settings";
import { adminProviderSettingsContract } from "@openrift/shared/contracts/admin/provider-settings";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchProviderSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<ProviderSettingsResponse> =>
    apiOrpcClient(adminProviderSettingsContract, context.cookie).list(),
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
  .validator((input: { providers: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminProviderSettingsContract, context.cookie).reorder({
      providers: data.providers,
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
  .validator(
    (input: {
      provider: string;
      sortOrder?: number;
      isHidden?: boolean;
      isFavorite?: boolean;
      helperReviewable?: boolean;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminProviderSettingsContract, context.cookie).update(data);
  });

export function useUpdateProviderSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: {
      provider: string;
      sortOrder?: number;
      isHidden?: boolean;
      isFavorite?: boolean;
      helperReviewable?: boolean;
    }) => {
      await updateProviderSettingFn({ data: vars });
    },
    invalidates: [queryKeys.admin.providerSettings, queryKeys.admin.cards.list],
  });
}
