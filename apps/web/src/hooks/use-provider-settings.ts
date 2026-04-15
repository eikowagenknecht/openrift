import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { ProviderSettingsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchProviderSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<ProviderSettingsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/provider-settings`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Provider settings fetch failed: ${res.status}`);
    }
    return res.json() as Promise<ProviderSettingsResponse>;
  });

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
    const res = await fetch(`${API_URL}/api/v1/admin/provider-settings/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ providers: data.providers }),
    });
    if (!res.ok) {
      throw new Error(`Reorder provider settings failed: ${res.status}`);
    }
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/provider-settings/${encodeURIComponent(data.provider)}`,
      {
        method: "PATCH",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          sortOrder: data.sortOrder,
          isHidden: data.isHidden,
          isFavorite: data.isFavorite,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Update provider setting failed: ${res.status}`);
    }
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
