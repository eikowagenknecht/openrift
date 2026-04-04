import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useThemeStore } from "./theme-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useThemeStore);
  // Ensure document.documentElement exists for applyTheme
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  resetStore();
  vi.restoreAllMocks();
});

describe("useThemeStore", () => {
  describe("initial state", () => {
    it("starts with null preference (use default)", () => {
      expect(useThemeStore.getState().preference).toBeNull();
    });

    it("resolves to a concrete theme", () => {
      const { theme } = useThemeStore.getState();
      expect(theme === "light" || theme === "dark").toBe(true);
    });
  });

  describe("setTheme", () => {
    it("sets light theme", () => {
      useThemeStore.getState().setTheme("light");

      const state = useThemeStore.getState();
      expect(state.preference).toBe("light");
      expect(state.theme).toBe("light");
    });

    it("sets dark theme", () => {
      useThemeStore.getState().setTheme("dark");

      const state = useThemeStore.getState();
      expect(state.preference).toBe("dark");
      expect(state.theme).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("sets auto theme (resolves based on system)", () => {
      useThemeStore.getState().setTheme("auto");

      const state = useThemeStore.getState();
      expect(state.preference).toBe("auto");
      expect(state.theme === "light" || state.theme === "dark").toBe(true);
    });

    it("sets null preference (same as auto/default)", () => {
      useThemeStore.getState().setTheme("dark");
      useThemeStore.getState().setTheme(null);

      const state = useThemeStore.getState();
      expect(state.preference).toBeNull();
      // Resolved theme depends on PREFERENCE_DEFAULTS.theme
      const defaultTheme = PREFERENCE_DEFAULTS.theme;
      if (defaultTheme === "light" || defaultTheme === "dark") {
        expect(state.theme).toBe(defaultTheme);
      }
    });

    it("applies dark class to documentElement", () => {
      useThemeStore.getState().setTheme("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      useThemeStore.getState().setTheme("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("toggleTheme", () => {
    it("cycles light → dark → auto → light", () => {
      useThemeStore.getState().setTheme("light");
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().preference).toBe("dark");

      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().preference).toBe("auto");

      // auto → light
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().preference).toBe("light");
    });
  });
});
