import type { UserPreferencesResponse } from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { CardFields } from "@/lib/card-fields";
import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useDisplayStore } from "@/stores/display-store";
import { useThemeStore } from "@/stores/theme-store";

const CACHE_KEY = "user-preferences";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function readCachedPreferences(): UserPreferencesResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      return JSON.parse(raw) as UserPreferencesResponse;
    }
  } catch {
    // Ignore corrupt cache
  }
  return null;
}

function writeCachedPreferences(prefs: UserPreferencesResponse) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

function applyPreferences(prefs: UserPreferencesResponse) {
  useDisplayStore.setState({
    showImages: prefs.showImages,
    richEffects: prefs.richEffects,
    cardFields: prefs.cardFields,
  });
  useThemeStore.setState({ theme: prefs.theme });
  applyTheme(prefs.theme);
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

/**
 * Syncs display and theme stores with the server for authenticated users.
 * Call this once in the app layout, passing `enabled: true` when the user is logged in.
 *
 * On mount, applies cached preferences from localStorage for instant restoration,
 * then fetches from the server and overwrites if different.
 */
export function usePreferencesSync(enabled: boolean) {
  const queryClient = useQueryClient();
  const hydrating = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const appliedCache = useRef(false);

  // Apply cached preferences synchronously on first mount to avoid flash
  if (enabled && !appliedCache.current) {
    appliedCache.current = true;
    const cached = readCachedPreferences();
    if (cached) {
      applyPreferences(cached);
    }
  }

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

    applyPreferences(data);
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
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(async () => {
        const { showImages, richEffects, cardFields } = useDisplayStore.getState();
        const { theme } = useThemeStore.getState();
        const prefs: UserPreferencesResponse = {
          showImages,
          richEffects,
          cardFields,
          theme,
        };
        await savePreferences(prefs);
        writeCachedPreferences(prefs);
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
