import type { UserPreferencesResponse } from "@openrift/shared";
import { preferencesContract } from "@openrift/shared/contracts/preferences";
import type { ContractRouterClient } from "@orpc/contract";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";

import { useHydrated } from "@/hooks/use-hydrated";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { sanitizePalette, sanitizeServerResponse, sanitizeTheme } from "@/lib/sanitize-preferences";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useDisplayStore } from "@/stores/display-store";
import { usePaletteStore } from "@/stores/palette-store";
import { useThemeStore } from "@/stores/theme-store";

type PreferencesUpdateInput = Parameters<
  ContractRouterClient<typeof preferencesContract>["update"]
>[0];

const fetchPreferencesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<UserPreferencesResponse> =>
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

function getPrefsSnapshot(): UserPreferencesResponse & {
  theme?: string | null;
  palette?: string | null;
} {
  const { overrides } = useDisplayStore.getState();
  const { preference: themePreference } = useThemeStore.getState();
  const { preference: palettePreference } = usePaletteStore.getState();

  // null tells the API to remove the key (reset to default).
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
    topLevelFilters: overrides.topLevelFilters,
    // Retired fields, folded into topLevelFilters; always null to clear them.
    hiddenFilterSections: null,
    compactFilterView: null,
    theme: themePreference,
    palette: palettePreference,
    // Response type has no nulls (PATCH-only "remove this key" markers), hence the cast.
  } as unknown as UserPreferencesResponse;
}

// getPrefsSnapshot builds its object literal in a fixed key order, so
// stringify is stable and can be compared for equality.
function serializePrefs(): string {
  return JSON.stringify(getPrefsSnapshot());
}

export function usePreferencesSync(enabled: boolean) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const hydrated = useHydrated();
  // Last snapshot known to match the server. Save skips when the stores
  // already match it; hydrate stands down when they don't. Null until seeded below.
  const lastSynced = useRef<string | null>(null);

  // Gated on `hydrated`: this query is SSR-prefetched fire-and-forget, so without
  // the gate the SSR-query integration hydrates it stuck at `pending` client-side.
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
      const snapshot = serializePrefs();
      if (snapshot === lastSynced.current) {
        return;
      }
      const prefs = getPrefsSnapshot();
      try {
        await patchPreferencesFn({ data: { prefs } });
      } catch {
        // Leave lastSynced on the last confirmed value so the edit stays marked
        // diverged and rides along with the next successful save.
        return;
      }
      lastSynced.current = snapshot;
      // Merge, not replace: overwriting would evict server-only keys (e.g.
      // emailNotifications) not present in this snapshot.
      queryClient.setQueryData(
        queryKeys.preferences.all(userId),
        (previous: UserPreferencesResponse | undefined) => ({ ...previous, ...prefs }),
      );
    },
    { wait: 1000 },
  );

  // Logged-out, or a fetch error: mark hydrated so downstream consumers
  // (e.g. the language-seed hook) aren't blocked forever.
  useEffect(() => {
    if (!enabled || isError) {
      useDisplayStore.getState().markPrefsHydrated();
    }
  }, [enabled, isError]);

  // Must run before the hydrate effect below (effect order): re-baselines on
  // identity change so a sign-out reset isn't read as the next user's unsynced edit.
  useScopeEffect(userId, () => {
    lastSynced.current = serializePrefs();
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    // An unsynced local edit outranks this payload, which was in flight before
    // the edit happened; skip it but still release the hydration signal.
    if (lastSynced.current !== null && serializePrefs() !== lastSynced.current) {
      useDisplayStore.getState().markPrefsHydrated();
      return;
    }

    const overrides = sanitizeServerResponse(data);
    useDisplayStore.getState().hydrateOverrides(overrides);

    const theme = sanitizeTheme((data as Record<string, unknown>).theme);
    useThemeStore.getState().setTheme(theme);

    const palette = sanitizePalette((data as Record<string, unknown>).palette);
    usePaletteStore.getState().setPalette(palette);

    // Recomputed from the stores, not `data`: hydrateOverrides merges, so a key
    // the server omitted keeps its local value.
    lastSynced.current = serializePrefs();
  }, [data]);

  useEffect(() => {
    function onStoreChange() {
      if (serializePrefs() === lastSynced.current) {
        return;
      }
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
