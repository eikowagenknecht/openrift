import type { UserPreferencesResponse } from "@openrift/shared";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";

import { queryKeys } from "@/lib/query-keys";
import { sanitizeServerResponse, sanitizeTheme } from "@/lib/sanitize-preferences";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

const fetchPreferencesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/preferences`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Preferences fetch failed: ${res.status}`);
    }
    return res.json() as Promise<UserPreferencesResponse>;
  });

const patchPreferencesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { prefs: UserPreferencesResponse }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/preferences`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data.prefs),
    });
    if (!res.ok) {
      throw new Error(`Patch preferences failed: ${res.status}`);
    }
  });

/**
 * Build the PATCH body from current store state.
 * Sends only explicitly-set values (non-null overrides).
 * Null overrides are sent as `null` to tell the API to remove the key.
 * @returns Snapshot of preferences to persist server-side.
 */
function getPrefsSnapshot(): UserPreferencesResponse & { theme?: string | null } {
  const { overrides } = useDisplayStore.getState();
  const { preference } = useThemeStore.getState();

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
    theme: preference,
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
  const hydrating = useRef(false);
  const saving = useRef(false);

  const { data, isError } = useQuery({
    queryKey: queryKeys.preferences.all,
    queryFn: () => fetchPreferencesFn(),
    enabled,
  });

  const debouncedSave = useDebouncedCallback(
    async () => {
      const prefs = getPrefsSnapshot();
      await patchPreferencesFn({ data: { prefs } });
      saving.current = true;
      queryClient.setQueryData(queryKeys.preferences.all, prefs);
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

    return () => {
      unsubDisplay();
      unsubTheme();
    };
  }, [debouncedSave]);
}
