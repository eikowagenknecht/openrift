import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useDisplayStore } from "@/stores/display-store";

/**
 * Seed the URL `languages` filter from the user's preferred languages as soon
 * as server prefs have hydrated, if the URL has no `languages` param. Runs
 * once per mount — if the user later clears every language in the filter
 * panel, the URL stays empty within that session (empty = show all, matching
 * other filters).
 *
 * Waiting on `prefsHydrated` avoids a race where the hook fires before
 * `usePreferencesSync` merges the server response, which would otherwise seed
 * with stale localStorage/default values (e.g. just `["EN"]`) instead of the
 * user's actual preferences.
 *
 * Preference order is preserved when seeding, which drives canonical printing
 * selection in `deduplicateByCard` / `groupPrintingsByCardId`.
 */
export function useSeedLanguagesFromPrefs(currentUrlLanguages: readonly string[]) {
  const preferredLanguages = useDisplayStore((s) => s.languages);
  const prefsHydrated = useDisplayStore((s) => s.prefsHydrated);
  const navigate = useNavigate();
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !prefsHydrated) {
      return;
    }
    seededRef.current = true;
    if (currentUrlLanguages.length === 0 && preferredLanguages.length > 0) {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, languages: preferredLanguages }),
        replace: true,
      });
    }
    // Fires once when prefs become hydrated; captures values at that moment.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- one-shot on hydrate
  }, [prefsHydrated]);
}
