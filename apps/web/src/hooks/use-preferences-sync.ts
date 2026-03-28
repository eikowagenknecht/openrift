import type { UserPreferencesResponse } from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { sanitizePreferences } from "@/lib/sanitize-preferences";
import { useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

/**
 * Fields synced to the database. Device-local prefs (e.g. maxColumns) are excluded.
 * @returns Snapshot of preferences to persist server-side.
 */
function getPrefsSnapshot(): UserPreferencesResponse {
  const { showImages, fancyFan, foilEffect, cardTilt, visibleFields, marketplaceOrder } =
    useDisplayStore.getState();
  const { theme } = useThemeStore.getState();
  return { showImages, fancyFan, foilEffect, cardTilt, visibleFields, theme, marketplaceOrder };
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

    const safe = sanitizePreferences(data);
    if (!safe) {
      return;
    }

    hydrating.current = true;

    useDisplayStore.setState({
      showImages: safe.showImages,
      fancyFan: safe.fancyFan,
      foilEffect: safe.foilEffect,
      cardTilt: safe.cardTilt,
      visibleFields: safe.visibleFields,
      marketplaceOrder: safe.marketplaceOrder,
    });
    if (safe.theme) {
      useThemeStore.setState({ theme: safe.theme });
    }

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
