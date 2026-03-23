import { create } from "zustand";
import { persist } from "zustand/middleware";

import { cookieStorage } from "@/lib/cookie-storage";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

function getSystemTheme(): Theme {
  if (typeof matchMedia !== "function") {
    return "light";
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: getSystemTheme(),
      toggleTheme: () =>
        set((state) => {
          const next = state.theme === "dark" ? "light" : "dark";
          applyTheme(next);
          return { theme: next };
        }),
    }),
    {
      name: "theme",
      storage: cookieStorage,
    },
  ),
);

// Apply the persisted theme on startup (after hydration from cookie)
// and keep the DOM in sync with any future changes.
if (typeof document !== "undefined") {
  useThemeStore.subscribe((state) => applyTheme(state.theme));
  applyTheme(useThemeStore.getState().theme);
}
