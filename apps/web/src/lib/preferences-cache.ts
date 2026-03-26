import type { UserPreferencesResponse } from "@openrift/shared";

export const PREFERENCES_CACHE_KEY = "user-preferences";

export function writeCachedPreferences(prefs: UserPreferencesResponse) {
  try {
    localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}
