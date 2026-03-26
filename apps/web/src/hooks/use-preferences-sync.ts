import type { UserPreferencesResponse } from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { CardFields } from "@/lib/card-fields";
import { writeCachedPreferences } from "@/lib/preferences-cache";
import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

async function fetchPreferences(): Promise<UserPreferencesResponse> {
  const res = await client.api.v1.preferences.$get();
  assertOk(res);
  return (await res.json()) as UserPreferencesResponse;
}

async function savePreferences(prefs: UserPreferencesResponse): Promise<void> {
  const res = await client.api.v1.preferences.$patch({ json: prefs });
  assertOk(res);
}

function prefsChanged(
  showImages: boolean,
  richEffects: boolean,
  cardFields: CardFields,
  theme: string,
  prevShowImages: boolean,
  prevRichEffects: boolean,
  prevCardFields: CardFields,
  prevTheme: string,
): boolean {
  return (
    showImages !== prevShowImages ||
    richEffects !== prevRichEffects ||
    theme !== prevTheme ||
    cardFields.number !== prevCardFields.number ||
    cardFields.title !== prevCardFields.title ||
    cardFields.type !== prevCardFields.type ||
    cardFields.rarity !== prevCardFields.rarity ||
    cardFields.price !== prevCardFields.price
  );
}

function getCurrentPrefs(): UserPreferencesResponse {
  const { showImages, richEffects, cardFields } = useDisplayStore.getState();
  const { theme } = useThemeStore.getState();
  return { showImages, richEffects, cardFields, theme };
}

/**
 * Syncs display and theme stores with the server for authenticated users.
 * Call this once in the app layout, passing `enabled: true` when the user is logged in.
 *
 * The display store initializes from the localStorage cache at module load time,
 * so preferences are correct from the first render. This hook fetches the server
 * values to confirm/overwrite, and writes back on changes.
 */
export function usePreferencesSync(enabled: boolean) {
  const queryClient = useQueryClient();
  const hydrating = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const { data } = useQuery({
    queryKey: queryKeys.preferences.all,
    queryFn: fetchPreferences,
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
    applyTheme(data.theme);
    writeCachedPreferences(data);

    // Allow a tick for the store subscriptions to fire before we start listening
    requestAnimationFrame(() => {
      hydrating.current = false;
    });
  }, [data]);

  // Subscribe to store changes and debounce-write to server
  useEffect(() => {
    function scheduleSave() {
      if (hydrating.current) {
        return;
      }
      // Write to localStorage immediately so F5 picks up the latest value
      writeCachedPreferences(getCurrentPrefs());
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(async () => {
        const prefs = getCurrentPrefs();
        await savePreferences(prefs);
        queryClient.setQueryData(queryKeys.preferences.all, prefs);
      }, 1000);
    }

    const unsubDisplay = useDisplayStore.subscribe((state, prev) => {
      if (
        prefsChanged(
          state.showImages,
          state.richEffects,
          state.cardFields,
          "",
          prev.showImages,
          prev.richEffects,
          prev.cardFields,
          "",
        )
      ) {
        scheduleSave();
      }
    });

    const unsubTheme = useThemeStore.subscribe((state, prev) => {
      if (state.theme !== prev.theme) {
        scheduleSave();
      }
    });

    return () => {
      unsubDisplay();
      unsubTheme();
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [queryClient]);
}
