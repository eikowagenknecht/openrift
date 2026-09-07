import type { Theme } from "@openrift/shared";
import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { cookieStorage } from "@/lib/cookie-storage";
import { sanitizeThemePreference } from "@/lib/sanitize-preferences";

type ResolvedTheme = "light" | "dark";

interface ThemeState {
  /** null means "use default" (auto). */
  preference: Theme | null;
  theme: ResolvedTheme;
  setTheme: (value: Theme | null) => void;
  toggleTheme: () => void;
  reset: () => void;
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
      reset: () => {
        const resolved = resolveTheme(null);
        applyTheme(resolved);
        set({ preference: null, theme: resolved });
      },
    }),
    {
      name: "theme",
      storage: cookieStorage,
      partialize: (state) => ({ preference: state.preference }),
      // zustand persist only writes on state changes, so the cookie would
      // otherwise be missing on first visit until the user changes the theme.
      onRehydrateStorage: () => (state) => {
        if (typeof document !== "undefined" && state && cookieStorage) {
          cookieStorage.setItem("theme", { state: { preference: state.preference } });
        }
      },
      merge: (persisted, current) => {
        const preference = sanitizeThemePreference(persisted);
        return {
          ...current,
          preference,
          theme: resolveTheme(preference),
        };
      },
    },
  ),
);

if (typeof document !== "undefined") {
  useThemeStore.subscribe((state) => applyTheme(state.theme));
  applyTheme(useThemeStore.getState().theme);

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
