import type { Theme } from "@openrift/shared";
import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { cookieStorage } from "@/lib/cookie-storage";

type ResolvedTheme = "light" | "dark";

interface ThemeState {
  /** Stored preference — null means "use default" (auto). */
  preference: Theme | null;
  /** Resolved theme applied to the DOM — always "light" or "dark". */
  theme: ResolvedTheme;
  setTheme: (value: Theme | null) => void;
  /** Legacy toggle — cycles light → dark → auto. */
  toggleTheme: () => void;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof matchMedia !== "function") {
    return "light";
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: Theme | null): ResolvedTheme {
  const effective = preference ?? PREFERENCE_DEFAULTS.theme;
  return effective === "auto" ? getSystemTheme() : effective;
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: null,
      theme: resolveTheme(null),
      setTheme: (value) => {
        const resolved = resolveTheme(value);
        applyTheme(resolved);
        set({ preference: value, theme: resolved });
      },
      toggleTheme: () =>
        set((state) => {
          const nextMap: Record<string, Theme | null> = {
            light: "dark",
            dark: "auto",
          };
          const effective = state.preference ?? PREFERENCE_DEFAULTS.theme;
          const next = effective === "auto" ? "light" : (nextMap[effective] ?? null);
          const resolved = resolveTheme(next);
          applyTheme(resolved);
          return { preference: next, theme: resolved };
        }),
    }),
    {
      name: "theme",
      storage: cookieStorage,
      partialize: (state) => ({ preference: state.preference }),
      // Ensure the cookie exists after first visit so the server can read the
      // theme preference on subsequent SSR requests. Zustand persist only writes
      // on state changes, so without this the cookie would be missing until the
      // user explicitly changes the theme or signs in.
      onRehydrateStorage: () => (state) => {
        if (typeof document !== "undefined" && state) {
          cookieStorage.setItem("theme", { state: { preference: state.preference } });
        }
      },
      merge: (persisted, current) => {
        const record =
          typeof persisted === "object" && persisted !== null
            ? (persisted as Record<string, unknown>)
            : {};
        // Migrate legacy `theme` key to `preference`
        const raw = record.preference === undefined ? record.theme : record.preference;
        const preference = raw === "light" || raw === "dark" || raw === "auto" ? raw : null;
        return {
          ...current,
          preference,
          theme: resolveTheme(preference),
        };
      },
    },
  ),
);

// Apply theme on startup and react to future changes
if (typeof document !== "undefined") {
  useThemeStore.subscribe((state) => applyTheme(state.theme));
  applyTheme(useThemeStore.getState().theme);

  // React to system preference changes when set to "auto"
  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const { preference } = useThemeStore.getState();
      const effective = preference ?? PREFERENCE_DEFAULTS.theme;
      if (effective === "auto") {
        const resolved = getSystemTheme();
        applyTheme(resolved);
        useThemeStore.setState({ theme: resolved });
      }
    });
  }
}
