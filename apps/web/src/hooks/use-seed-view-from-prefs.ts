import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useFilterSearch } from "@/lib/search-schemas";
import { useDisplayStore } from "@/stores/display-store";

/**
 * Seed the URL `view` param from the user's `defaultCardView` preference as
 * soon as server prefs have hydrated, if the URL has no `view` param. Runs
 * once per mount — after that the URL is the source of truth, so toggling
 * the view on the page never writes back to the preference.
 *
 * Waiting on `prefsHydrated` avoids a race where the hook fires before
 * `usePreferencesSync` merges the server response and would otherwise seed
 * with the static default instead of the user's actual preference.
 */
export function useSeedViewFromPrefs() {
  const rawView = useFilterSearch().view;
  const defaultCardView = useDisplayStore((s) => s.defaultCardView);
  const prefsHydrated = useDisplayStore((s) => s.prefsHydrated);
  const navigate = useNavigate();
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !prefsHydrated) {
      return;
    }
    seededRef.current = true;
    if (rawView === undefined && defaultCardView !== "cards") {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, view: defaultCardView }),
        replace: true,
      });
    }
    // Fires once when prefs become hydrated; captures values at that moment.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- one-shot on hydrate
  }, [prefsHydrated]);
}
