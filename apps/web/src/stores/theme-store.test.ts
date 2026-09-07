import { PREFERENCE_DEFAULTS } from "@openrift/shared/types/api/preferences";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useThemeStore } from "./theme-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useThemeStore);
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

    it("resolves to the dark default", () => {
      expect(PREFERENCE_DEFAULTS.theme).toBe("dark");
      expect(useThemeStore.getState().theme).toBe("dark");
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

    it("sets null preference (falls back to the dark default)", () => {
      useThemeStore.getState().setTheme("light");
      useThemeStore.getState().setTheme(null);

      const state = useThemeStore.getState();
      expect(state.preference).toBeNull();
      expect(state.theme).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("applies dark class to documentElement", () => {
      useThemeStore.getState().setTheme("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      useThemeStore.getState().setTheme("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("toggleTheme", () => {
    it("cycles dark → light → auto → dark", () => {
      useThemeStore.getState().setTheme("dark");
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().preference).toBe("light");

      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().preference).toBe("auto");

      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().preference).toBe("dark");
    });

    it("starts the cycle at light for a user with no stored preference", () => {
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().preference).toBe("light");
    });
  });

  describe("reset", () => {
    it("clears the stored preference and reapplies the dark default", () => {
      useThemeStore.getState().setTheme("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);

      useThemeStore.getState().reset();

      const state = useThemeStore.getState();
      expect(state.preference).toBeNull();
      expect(state.theme).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });
});
