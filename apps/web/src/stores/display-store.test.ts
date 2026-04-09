import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useDisplayStore } from "./display-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useDisplayStore);
});

afterEach(() => {
  resetStore();
});

describe("useDisplayStore", () => {
  describe("initial state", () => {
    it("resolves all values from defaults when overrides are null", () => {
      const state = useDisplayStore.getState();
      expect(state.showImages).toBe(PREFERENCE_DEFAULTS.showImages);
      expect(state.fancyFan).toBe(PREFERENCE_DEFAULTS.fancyFan);
      expect(state.foilEffect).toBe(PREFERENCE_DEFAULTS.foilEffect);
      expect(state.cardTilt).toBe(PREFERENCE_DEFAULTS.cardTilt);
      expect(state.marketplaceOrder).toEqual(PREFERENCE_DEFAULTS.marketplaceOrder);
      expect(state.languages).toEqual(PREFERENCE_DEFAULTS.languages);
    });

    it("starts with all overrides as null", () => {
      const { overrides } = useDisplayStore.getState();
      expect(overrides.showImages).toBeNull();
      expect(overrides.fancyFan).toBeNull();
      expect(overrides.foilEffect).toBeNull();
      expect(overrides.cardTilt).toBeNull();
      expect(overrides.marketplaceOrder).toBeNull();
      expect(overrides.languages).toBeNull();
    });
  });

  describe("setters", () => {
    it("setShowImages updates both resolved value and override", () => {
      useDisplayStore.getState().setShowImages(false);

      const state = useDisplayStore.getState();
      expect(state.showImages).toBe(false);
      expect(state.overrides.showImages).toBe(false);
    });

    it("setFancyFan updates both resolved value and override", () => {
      useDisplayStore.getState().setFancyFan(false);

      const state = useDisplayStore.getState();
      expect(state.fancyFan).toBe(false);
      expect(state.overrides.fancyFan).toBe(false);
    });

    it("setFoilEffect updates both resolved value and override", () => {
      useDisplayStore.getState().setFoilEffect(false);

      expect(useDisplayStore.getState().foilEffect).toBe(false);
      expect(useDisplayStore.getState().overrides.foilEffect).toBe(false);
    });

    it("setCardTilt updates both resolved value and override", () => {
      useDisplayStore.getState().setCardTilt(false);

      expect(useDisplayStore.getState().cardTilt).toBe(false);
      expect(useDisplayStore.getState().overrides.cardTilt).toBe(false);
    });

    it("setMarketplaceOrder updates the order", () => {
      const newOrder = ["cardmarket" as const, "tcgplayer" as const];
      useDisplayStore.getState().setMarketplaceOrder(newOrder);

      expect(useDisplayStore.getState().marketplaceOrder).toEqual(newOrder);
      expect(useDisplayStore.getState().overrides.marketplaceOrder).toEqual(newOrder);
    });

    it("setLanguages updates languages", () => {
      useDisplayStore.getState().setLanguages(["DE", "FR"]);

      expect(useDisplayStore.getState().languages).toEqual(["DE", "FR"]);
      expect(useDisplayStore.getState().overrides.languages).toEqual(["DE", "FR"]);
    });
  });

  describe("resetPreference", () => {
    it("resets a boolean preference to its default", () => {
      useDisplayStore.getState().setShowImages(false);
      useDisplayStore.getState().resetPreference("showImages");

      const state = useDisplayStore.getState();
      expect(state.showImages).toBe(PREFERENCE_DEFAULTS.showImages);
      expect(state.overrides.showImages).toBeNull();
    });

    it("resets marketplace order to default", () => {
      useDisplayStore.getState().setMarketplaceOrder(["cardmarket"]);
      useDisplayStore.getState().resetPreference("marketplaceOrder");

      expect(useDisplayStore.getState().marketplaceOrder).toEqual(
        PREFERENCE_DEFAULTS.marketplaceOrder,
      );
      expect(useDisplayStore.getState().overrides.marketplaceOrder).toBeNull();
    });

    it("resets languages to default", () => {
      useDisplayStore.getState().setLanguages(["DE"]);
      useDisplayStore.getState().resetPreference("languages");

      expect(useDisplayStore.getState().languages).toEqual(PREFERENCE_DEFAULTS.languages);
      expect(useDisplayStore.getState().overrides.languages).toBeNull();
    });
  });

  describe("hydrateOverrides", () => {
    it("applies incoming overrides and resolves values", () => {
      useDisplayStore.getState().hydrateOverrides({
        showImages: false,
        fancyFan: true,
        foilEffect: null,
        cardTilt: null,
        marketplaceOrder: ["cardmarket"],
        languages: null,
      });

      const state = useDisplayStore.getState();
      expect(state.showImages).toBe(false);
      expect(state.fancyFan).toBe(true);
      expect(state.foilEffect).toBe(PREFERENCE_DEFAULTS.foilEffect);
      expect(state.marketplaceOrder).toEqual(["cardmarket"]);
      expect(state.languages).toEqual(PREFERENCE_DEFAULTS.languages);
    });
  });

  describe("device-local state", () => {
    it("setMaxColumns with value", () => {
      useDisplayStore.getState().setMaxColumns(4);
      expect(useDisplayStore.getState().maxColumns).toBe(4);
    });

    it("setMaxColumns with null", () => {
      useDisplayStore.getState().setMaxColumns(4);
      useDisplayStore.getState().setMaxColumns(null);
      expect(useDisplayStore.getState().maxColumns).toBeNull();
    });

    it("setMaxColumns with updater function", () => {
      useDisplayStore.getState().setMaxColumns(4);
      useDisplayStore.getState().setMaxColumns((prev) => (prev === null ? 1 : prev + 1));
      expect(useDisplayStore.getState().maxColumns).toBe(5);
    });

    it("setFiltersExpanded toggles the flag", () => {
      expect(useDisplayStore.getState().filtersExpanded).toBe(false);
      useDisplayStore.getState().setFiltersExpanded(true);
      expect(useDisplayStore.getState().filtersExpanded).toBe(true);
    });

    it("cycleCatalogMode cycles through off → count → add → off", () => {
      expect(useDisplayStore.getState().catalogMode).toBe("off");
      useDisplayStore.getState().cycleCatalogMode();
      expect(useDisplayStore.getState().catalogMode).toBe("count");
      useDisplayStore.getState().cycleCatalogMode();
      expect(useDisplayStore.getState().catalogMode).toBe("add");
      useDisplayStore.getState().cycleCatalogMode();
      expect(useDisplayStore.getState().catalogMode).toBe("off");
    });

    it("layout state setters work", () => {
      useDisplayStore.getState().setPhysicalMax(12);
      useDisplayStore.getState().setPhysicalMin(2);
      useDisplayStore.getState().setAutoColumns(6);

      const state = useDisplayStore.getState();
      expect(state.physicalMax).toBe(12);
      expect(state.physicalMin).toBe(2);
      expect(state.autoColumns).toBe(6);
    });
  });
});
