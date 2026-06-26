import type { UserPreferencesResponse } from "@openrift/shared";
import { preferencesContract } from "@openrift/shared/contracts";
import type { ContractRouterClient } from "@orpc/contract";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";

import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { sanitizePalette, sanitizeServerResponse, sanitizeTheme } from "@/lib/sanitize-preferences";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useDisplayStore } from "@/stores/display-store";
import { usePaletteStore } from "@/stores/palette-store";
import { useThemeStore } from "@/stores/theme-store";

// PATCH input derived from the contract (write subset, all optional).
type PreferencesUpdateInput = Parameters<
  ContractRouterClient<typeof preferencesContract>["update"]
>[0];

// Migrated to oRPC: contract-typed client instead of the hc client.
const fetchPreferencesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserPreferencesResponse> =>
      apiOrpcClient(preferencesContract, context.cookie).get(),
  );

const patchPreferencesFn = createServerFn({ method: "POST" })
  .validator((input: { prefs: UserPreferencesResponse }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(preferencesContract, context.cookie).update(
      data.prefs as PreferencesUpdateInput,
    );
  });

/**
 * Build the PATCH body from current store state.
 * Sends only explicitly-set values (non-null overrides).
 * Null overrides are sent as `null` to tell the API to remove the key.
 * @returns Snapshot of preferences to persist server-side.
 */
function getPrefsSnapshot(): UserPreferencesResponse & {
  theme?: string | null;
  palette?: string | null;
} {
  const { overrides } = useDisplayStore.getState();
  const { preference: themePreference } = useThemeStore.getState();
  const { preference: palettePreference } = usePaletteStore.getState();

  // Send all overrides — null tells the API to remove the key (reset to default).
  return {
    showImages: overrides.showImages,
    fancyFan: overrides.fancyFan,
    foilEffect: overrides.foilEffect,
    cardTilt: overrides.cardTilt,
    marketplaceOrder: overrides.marketplaceOrder,
    languages: overrides.languages,
    completionScope: overrides.completionScope,
    defaultCardView: overrides.defaultCardView,
    defaultCurrency: overrides.defaultCurrency,
    hiddenFilterSections: overrides.hiddenFilterSections,
    theme: themePreference,
    palette: palettePreference,
  } as UserPreferencesResponse;
}

/**
 * Syncs display and theme stores with the server for authenticated users.
 * Call once in the app layout with `enabled` tied to session state.
 *
 * The display store uses Zustand persist (localStorage) for instant hydration.
 * This hook confirms against the server and writes back on changes.
 */
export function usePreferencesSync(enabled: boolean) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const hydrated = useHydrated();
  const hydrating = useRef(false);
  const saving = useRef(false);

  // Client-only (`hydrated`): this query is otherwise started fire-and-forget
  // during the SSR render (the session is SSR-prefetched, so it's enabled
  // server-side), which the router SSR-query integration dehydrates as
  // `pending` and can then hydrate stuck-`pending` on the client — the prefs
  // would never resolve. The hook only consumes `data` in client effects, so
  // gating on hydration is behaviour-neutral except that it fetches fresh on
  // the client. The `markPrefsHydrated` fallback below keys off the `enabled`
  // (logged-in) prop, not this query, so the language-seed signal is unaffected.
  const { data, isError } = useQuery({
    queryKey: queryKeys.preferences.all(userId ?? ""),
    queryFn: () => fetchPreferencesFn(),
    enabled: enabled && Boolean(userId) && hydrated,
  });

  const debouncedSave = useDebouncedCallback(
    async () => {
      if (!userId) {
        return;
      }
      const prefs = getPrefsSnapshot();
      await patchPreferencesFn({ data: { prefs } });
      saving.current = true;
      // Merge, not replace: the snapshot only carries display/theme/palette
      // prefs, so a plain overwrite would evict server-only keys like
      // `emailNotifications` (ADR-030) from the shared cache, which the profile
      // toggles read.
      queryClient.setQueryData(
        queryKeys.preferences.all(userId),
        (previous: UserPreferencesResponse | undefined) => ({ ...previous, ...prefs }),
      );
    },
    { wait: 1000 },
  );

  // Logged-out users never hit the server, so there's nothing to wait for —
  // mark prefs hydrated immediately. If the server fetch errors for a
  // logged-in user, fall back to whatever localStorage/defaults resolved to
  // rather than blocking downstream consumers (e.g. the language-seed hook)
  // forever.
  useEffect(() => {
    if (!enabled || isError) {
      useDisplayStore.getState().markPrefsHydrated();
    }
  }, [enabled, isError]);

  // Hydrate stores when server data arrives (skip if we just saved)
  useEffect(() => {
    if (!data || saving.current) {
      saving.current = false;
      return;
    }

    hydrating.current = true;

    const overrides = sanitizeServerResponse(data);
    useDisplayStore.getState().hydrateOverrides(overrides);

    const theme = sanitizeTheme((data as Record<string, unknown>).theme);
    useThemeStore.getState().setTheme(theme);

    const palette = sanitizePalette((data as Record<string, unknown>).palette);
    usePaletteStore.getState().setPalette(palette);

    requestAnimationFrame(() => {
      hydrating.current = false;
    });
  }, [data]);

  // Subscribe to store changes and debounce-save to server
  useEffect(() => {
    let prev = JSON.stringify(getPrefsSnapshot());

    function onStoreChange() {
      if (hydrating.current) {
        return;
      }
      const next = JSON.stringify(getPrefsSnapshot());
      if (next === prev) {
        return;
      }
      prev = next;
      debouncedSave();
    }

    const unsubDisplay = useDisplayStore.subscribe(onStoreChange);
    const unsubTheme = useThemeStore.subscribe(onStoreChange);
    const unsubPalette = usePaletteStore.subscribe(onStoreChange);

    return () => {
      unsubDisplay();
      unsubTheme();
      unsubPalette();
    };
  }, [debouncedSave]);
}
