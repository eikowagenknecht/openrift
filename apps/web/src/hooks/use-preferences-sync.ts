import type { UserPreferencesResponse } from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { sanitizeServerResponse, sanitizeTheme } from "@/lib/sanitize-preferences";
import type { DisplayOverrides } from "@/stores/display-store";
import { useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

/**
 * Build the PATCH body from current store state.
 * Sends only explicitly-set values (non-null overrides).
 * Null overrides are sent as `null` to tell the API to remove the key.
 * @returns Snapshot of preferences to persist server-side.
 */
function getPrefsSnapshot(): UserPreferencesResponse & { theme?: string | null } {
  const { overrides } = useDisplayStore.getState();
  const { preference } = useThemeStore.getState();

  const result: Record<string, unknown> = {};

  // Top-level display overrides
  if (overrides.showImages !== null) {
    result.showImages = overrides.showImages;
  }
  if (overrides.fancyFan !== null) {
    result.fancyFan = overrides.fancyFan;
  }
  if (overrides.foilEffect !== null) {
    result.foilEffect = overrides.foilEffect;
  }
  if (overrides.cardTilt !== null) {
    result.cardTilt = overrides.cardTilt;
  }

  // Visible fields — only include non-null sub-fields
  const vfEntries = Object.entries(overrides.visibleFields).filter(([, v]) => v !== null);
  if (vfEntries.length > 0) {
    result.visibleFields = Object.fromEntries(vfEntries);
  }

  // Marketplace order
  if (overrides.marketplaceOrder !== null) {
    result.marketplaceOrder = overrides.marketplaceOrder;
  }

  // Theme
  if (preference !== null) {
    result.theme = preference;
  }

  return result as UserPreferencesResponse;
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
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const { data } = useQuery({
    queryKey: queryKeys.preferences.all,
    queryFn: async () => {
      const res = await client.api.v1.preferences.$get();
      assertOk(res);
      return (await res.json()) as UserPreferencesResponse;
    },
    enabled,
  });

  // Hydrate stores when server data arrives
  useEffect(() => {
    if (!data) {
      return;
    }

    hydrating.current = true;

    const overrides: DisplayOverrides = sanitizeServerResponse(data);
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

      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(async () => {
        const prefs = getPrefsSnapshot();
        const res = await client.api.v1.preferences.$patch({ json: prefs });
        assertOk(res);
        queryClient.setQueryData(queryKeys.preferences.all, prefs);
      }, 1000);
    }

    const unsubDisplay = useDisplayStore.subscribe(onStoreChange);
    const unsubTheme = useThemeStore.subscribe(onStoreChange);

    return () => {
      unsubDisplay();
      unsubTheme();
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [queryClient]);
}
