import { PREFERENCE_DEFAULTS } from "@openrift/shared/types/api/preferences";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { usePaletteStore } from "./palette-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(usePaletteStore);
  delete document.documentElement.dataset.palette;
});

afterEach(() => {
  resetStore();
  vi.restoreAllMocks();
});

describe("usePaletteStore", () => {
  describe("initial state", () => {
    it("starts with null preference (use default)", () => {
      expect(usePaletteStore.getState().preference).toBeNull();
    });

    it("resolves to the default palette", () => {
      expect(usePaletteStore.getState().palette).toBe(PREFERENCE_DEFAULTS.palette);
    });
  });

  describe("setPalette", () => {
    it("sets a concrete palette", () => {
      usePaletteStore.getState().setPalette("default");

      const state = usePaletteStore.getState();
      expect(state.preference).toBe("default");
      expect(state.palette).toBe("default");
      expect(document.documentElement.dataset.palette).toBe("default");
    });

    it("clears preference when set to null", () => {
      usePaletteStore.getState().setPalette("default");
      usePaletteStore.getState().setPalette(null);

      const state = usePaletteStore.getState();
      expect(state.preference).toBeNull();
      expect(state.palette).toBe(PREFERENCE_DEFAULTS.palette);
    });
  });

  describe("reset", () => {
    it("clears the stored preference and reapplies the default", () => {
      usePaletteStore.getState().setPalette("default");
      usePaletteStore.getState().reset();

      const state = usePaletteStore.getState();
      expect(state.preference).toBeNull();
      expect(state.palette).toBe(PREFERENCE_DEFAULTS.palette);
      expect(document.documentElement.dataset.palette).toBe(PREFERENCE_DEFAULTS.palette);
    });
  });

  describe("persistence merge", () => {
    it("ignores unknown palette values", () => {
      const merge = (
        usePaletteStore.persist.getOptions() as {
          merge?: (persisted: unknown, current: unknown) => unknown;
        }
      ).merge;
      expect(merge).toBeDefined();

      const result = merge?.(
        { preference: "totally-not-a-palette" },
        usePaletteStore.getState(),
      ) as { preference: unknown; palette: unknown };

      expect(result.preference).toBeNull();
      expect(result.palette).toBe(PREFERENCE_DEFAULTS.palette);
    });
  });
});
