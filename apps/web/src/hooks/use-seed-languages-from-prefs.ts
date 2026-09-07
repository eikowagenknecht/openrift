import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useDisplayStore } from "@/stores/display-store";

/**
 * Waits on `prefsHydrated` so this doesn't fire before `usePreferencesSync` merges
 * the server response, seeding from stale localStorage/default values instead.
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- one-shot on hydrate
  }, [prefsHydrated]);
}
