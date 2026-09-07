import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { TIER_TILE_WIDTHS, useDisplayStore } from "./display-store";

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
      expect(state.defaultCardView).toBe(PREFERENCE_DEFAULTS.defaultCardView);
      expect(state.topLevelFilters).toEqual(PREFERENCE_DEFAULTS.topLevelFilters);
    });

    it("starts with all overrides as null", () => {
      const { overrides } = useDisplayStore.getState();
      expect(overrides.showImages).toBeNull();
      expect(overrides.fancyFan).toBeNull();
      expect(overrides.foilEffect).toBeNull();
      expect(overrides.cardTilt).toBeNull();
      expect(overrides.marketplaceOrder).toBeNull();
      expect(overrides.languages).toBeNull();
      expect(overrides.defaultCardView).toBeNull();
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

    it("setTopLevelFilters updates both resolved value and override", () => {
      useDisplayStore.getState().setTopLevelFilters(["sets", "owned"]);

      const state = useDisplayStore.getState();
      expect(state.topLevelFilters).toEqual(["sets", "owned"]);
      expect(state.overrides.topLevelFilters).toEqual(["sets", "owned"]);
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

    it("setDefaultCardView updates both resolved value and override", () => {
      useDisplayStore.getState().setDefaultCardView("cards");

      const state = useDisplayStore.getState();
      expect(state.defaultCardView).toBe("cards");
      expect(state.overrides.defaultCardView).toBe("cards");
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

    it("resets defaultCardView to default", () => {
      useDisplayStore.getState().setDefaultCardView("cards");
      useDisplayStore.getState().resetPreference("defaultCardView");

      expect(useDisplayStore.getState().defaultCardView).toBe(PREFERENCE_DEFAULTS.defaultCardView);
      expect(useDisplayStore.getState().overrides.defaultCardView).toBeNull();
    });

    it("resets topLevelFilters to the default placement", () => {
      useDisplayStore.getState().setTopLevelFilters(["sets"]);
      useDisplayStore.getState().resetPreference("topLevelFilters");

      expect(useDisplayStore.getState().topLevelFilters).toEqual(
        PREFERENCE_DEFAULTS.topLevelFilters,
      );
      expect(useDisplayStore.getState().overrides.topLevelFilters).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears every override and resolves back to defaults", () => {
      const store = useDisplayStore.getState();
      store.setShowImages(false);
      store.setFancyFan(true);
      store.setFoilEffect(false);
      store.setCardTilt(false);
      store.setMarketplaceOrder(["cardmarket"]);
      store.setLanguages(["DE", "FR"]);
      store.setDefaultCardView("cards");

      useDisplayStore.getState().reset();

      const state = useDisplayStore.getState();
      expect(state.overrides).toEqual({
        showImages: null,
        fancyFan: null,
        foilEffect: null,
        cardTilt: null,
        marketplaceOrder: null,
        languages: null,
        completionScope: null,
        defaultCardView: null,
        defaultCurrency: null,
        topLevelFilters: null,
      });
      expect(state.showImages).toBe(PREFERENCE_DEFAULTS.showImages);
      expect(state.fancyFan).toBe(PREFERENCE_DEFAULTS.fancyFan);
      expect(state.foilEffect).toBe(PREFERENCE_DEFAULTS.foilEffect);
      expect(state.cardTilt).toBe(PREFERENCE_DEFAULTS.cardTilt);
      expect(state.marketplaceOrder).toEqual(PREFERENCE_DEFAULTS.marketplaceOrder);
      expect(state.languages).toEqual(PREFERENCE_DEFAULTS.languages);
      expect(state.defaultCardView).toBe(PREFERENCE_DEFAULTS.defaultCardView);
    });

    it("preserves device-local state", () => {
      const store = useDisplayStore.getState();
      store.setLanguages(["DE"]);
      store.setMaxColumns(4);
      store.setFiltersExpanded(true);
      store.toggleCardsShowCounts();
      store.setMetaDeckView("grid");

      useDisplayStore.getState().reset();

      const state = useDisplayStore.getState();
      expect(state.maxColumns).toBe(4);
      expect(state.filtersExpanded).toBe(true);
      expect(state.cardsShowCounts).toBe(false);
      expect(state.metaDeckView).toBe("grid");
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
        completionScope: null,
        defaultCardView: "cards",
      });

      const state = useDisplayStore.getState();
      expect(state.showImages).toBe(false);
      expect(state.fancyFan).toBe(true);
      expect(state.foilEffect).toBe(PREFERENCE_DEFAULTS.foilEffect);
      expect(state.marketplaceOrder).toEqual(["cardmarket"]);
      expect(state.languages).toEqual(PREFERENCE_DEFAULTS.languages);
      expect(state.defaultCardView).toBe("cards");
    });

    it("hydrates topLevelFilters and preserves it when the field is absent", () => {
      useDisplayStore.getState().hydrateOverrides({ topLevelFilters: ["sets", "markers"] });
      expect(useDisplayStore.getState().topLevelFilters).toEqual(["sets", "markers"]);

      useDisplayStore.getState().hydrateOverrides({ showImages: false });
      expect(useDisplayStore.getState().topLevelFilters).toEqual(["sets", "markers"]);
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

    it("toggleCardsShowCounts flips between true and false", () => {
      expect(useDisplayStore.getState().cardsShowCounts).toBe(true);
      useDisplayStore.getState().toggleCardsShowCounts();
      expect(useDisplayStore.getState().cardsShowCounts).toBe(false);
      useDisplayStore.getState().toggleCardsShowCounts();
      expect(useDisplayStore.getState().cardsShowCounts).toBe(true);
    });

    it("setDisplayMode toggles between grid and table", () => {
      expect(useDisplayStore.getState().displayMode).toBe("grid");
      useDisplayStore.getState().setDisplayMode("table");
      expect(useDisplayStore.getState().displayMode).toBe("table");
      useDisplayStore.getState().setDisplayMode("grid");
      expect(useDisplayStore.getState().displayMode).toBe("grid");
    });

    it("paneDocked starts closed so a card click opens the modal", () => {
      expect(useDisplayStore.getState().paneDocked).toBe(false);
    });

    it("setPaneDocked docks and undocks the detail pane", () => {
      useDisplayStore.getState().setPaneDocked(true);
      expect(useDisplayStore.getState().paneDocked).toBe(true);
      useDisplayStore.getState().setPaneDocked(false);
      expect(useDisplayStore.getState().paneDocked).toBe(false);
    });

    it("frostedBars starts off — the blur costs about a frame in three while scrolling", () => {
      expect(useDisplayStore.getState().frostedBars).toBe(false);
    });

    it("setFrostedBars drives the document attribute the CSS keys off", () => {
      useDisplayStore.getState().setFrostedBars(true);
      expect(useDisplayStore.getState().frostedBars).toBe(true);
      expect(document.documentElement.dataset.frosted).toBe("");

      useDisplayStore.getState().setFrostedBars(false);
      expect(useDisplayStore.getState().frostedBars).toBe(false);
      expect(document.documentElement.dataset.frosted).toBeUndefined();
    });

    it("tierTileStep starts on the size the board was designed around", () => {
      expect(TIER_TILE_WIDTHS[useDisplayStore.getState().tierTileStep]).toBe(56);
    });

    it("setTierTileStep walks the ladder", () => {
      useDisplayStore.getState().setTierTileStep(4);
      expect(useDisplayStore.getState().tierTileStep).toBe(4);
    });

    it("setTierTileStep clamps to the ends of the ladder", () => {
      useDisplayStore.getState().setTierTileStep(-3);
      expect(useDisplayStore.getState().tierTileStep).toBe(0);
      useDisplayStore.getState().setTierTileStep(99);
      expect(useDisplayStore.getState().tierTileStep).toBe(TIER_TILE_WIDTHS.length - 1);
    });
  });
});
