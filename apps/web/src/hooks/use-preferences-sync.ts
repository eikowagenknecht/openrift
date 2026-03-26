import type { UserPreferencesResponse } from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { PREFERENCES_CACHE_KEY, useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

function getPrefsSnapshot(): UserPreferencesResponse {
  const { showImages, richEffects, cardFields } = useDisplayStore.getState();
  const { theme } = useThemeStore.getState();
  return { showImages, richEffects, cardFields, theme };
}

function writeCache(prefs: UserPreferencesResponse) {
  try {
    localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Syncs display and theme stores with the server for authenticated users.
 * Call once in the app layout with `enabled` tied to session state.
 *
 * The display store reads from localStorage at module load, so the first
 * render already has the right values. This hook confirms against the
 * server and writes back on changes.
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

    useDisplayStore.setState({
      showImages: data.showImages,
      richEffects: data.richEffects,
      cardFields: data.cardFields,
    });
    useThemeStore.setState({ theme: data.theme });
    writeCache(data);

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
      writeCache(getPrefsSnapshot());

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
