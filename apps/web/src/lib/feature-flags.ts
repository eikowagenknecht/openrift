// Feature flags fetched from the API at app boot, with localStorage fallback.

type FeatureFlags = Record<string, boolean>;

const STORAGE_KEY = "openrift:feature-flags";

let flags: FeatureFlags = {};

export function featureEnabled(key: string): boolean {
  return flags[key] === true;
}

export async function loadFeatureFlags(): Promise<void> {
  try {
    const res = await fetch("/api/feature-flags");
    if (res.ok) {
      flags = (await res.json()) as FeatureFlags;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
      return;
    }
  } catch {
    // Network error — fall through to localStorage
  }

  // Offline / API unreachable — use last cached flags
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      flags = JSON.parse(cached) as FeatureFlags;
    }
  } catch {
    // Corrupted localStorage — start with no flags
  }
}
