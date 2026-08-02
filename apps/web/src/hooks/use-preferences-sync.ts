import type { UserPreferencesResponse } from "@openrift/shared";
import { preferencesContract } from "@openrift/shared/contracts/preferences";
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
    topLevelFilters: overrides.topLevelFilters,
    // Retired preferences: always send null so the legacy keys are cleared
    // from the stored prefs (hidden sections are part of topLevelFilters now;
    // the compact view is simply how the filter chrome works).
    hiddenFilterSections: null,
    compactFilterView: null,
    theme: themePreference,
    palette: palettePreference,
    // The response type has no nulls (they're PATCH-only "remove this key"
    // markers), so the snapshot needs the double cast.
  } as unknown as UserPreferencesResponse;
}

/**
 * Canonical serialization of the preferences the stores currently hold.
 *
 * This is the hook's whole coordination mechanism: one string that answers "do
 * the stores and the server already agree?". Comparing it beats the flag-based
 * approach it replaced because it describes state rather than guarding a window
 * in time — there is no frame during which a store write can slip past it, and
 * a render that arrives with no data can't burn it.
 *
 * `getPrefsSnapshot` builds its object literal in a fixed key order, so plain
 * stringify is stable.
 * @returns The serialized snapshot.
 */
function serializePrefs(): string {
  return JSON.stringify(getPrefsSnapshot());
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
  // The last snapshot the stores and the server are known to agree on. Anything
  // else in the stores is a local edit that still owes the server a PATCH, and
  // that one fact drives both directions: the save path skips when the stores
  // already match it, and the hydrate path stands down when they don't (a
  // refetch that resolves mid-edit must not paint the pre-edit server values
  // back over the change). Null until the subscribe effect seeds it on mount,
  // which is also what lets the very first server payload hydrate unconditionally.
  const lastSynced = useRef<string | null>(null);

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
      const snapshot = serializePrefs();
      // Nothing to send: the stores already hold what the server has. Reached
      // whenever the change that woke the subscriber was device-local (column
      // count, filter expansion) or was itself a hydration write.
      if (snapshot === lastSynced.current) {
        return;
      }
      const prefs = getPrefsSnapshot();
      try {
        await patchPreferencesFn({ data: { prefs } });
      } catch {
        // Keep `lastSynced` on the last value the server confirmed, so the
        // stores stay marked as diverged: the edit survives in localStorage and
        // rides along with the next successful save instead of being quietly
        // overwritten by the next refetch.
        return;
      }
      lastSynced.current = snapshot;
      // Merge, not replace: the snapshot only carries display/theme/palette
      // prefs, so a plain overwrite would evict server-only keys like
      // `emailNotifications` (ADR-030) from the shared cache, which the profile
      // toggles read. The write lands back here as fresh `data`, which the
      // hydrate effect recognises as its own echo and applies as a no-op.
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

  // Hydrate stores when server data arrives.
  useEffect(() => {
    if (!data) {
      return;
    }

    // An edit the server hasn't been told about yet outranks this payload,
    // which was in flight before the edit happened. Applying it would revert a
    // toggle the user just flipped, and the pending save would then send the
    // reverted value back. Downstream consumers still need the hydration
    // signal, so release them explicitly on this path.
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

    // Recomputed from the stores, not from `data`: hydrateOverrides merges, so
    // a key the server omitted keeps its local value and the two are only
    // in agreement on the merged result.
    lastSynced.current = serializePrefs();
  }, [data]);

  // Subscribe to store changes and debounce-save to server
  useEffect(() => {
    lastSynced.current ??= serializePrefs();

    function onStoreChange() {
      // Cheap filter only. The debounced callback re-checks against the same
      // snapshot at fire time, which is what makes the hydration writes free:
      // they wake the subscriber, then settle back to agreement before the
      // timer elapses.
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
