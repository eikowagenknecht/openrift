import { describe, expect, it } from "vitest";

import {
  sanitizeCardsShowCounts,
  sanitizeDisplayMode,
  sanitizeMetaDeckView,
  sanitizeFiltersExpanded,
  sanitizeOverrides,
  sanitizePaneDocked,
  sanitizeServerResponse,
  sanitizeThemePreference,
  sanitizeTierTileStep,
} from "./sanitize-preferences";

describe("sanitize-preferences — topLevelFilters", () => {
  describe("sanitizeServerResponse", () => {
    it("keeps a valid array of unit keys", () => {
      const result = sanitizeServerResponse({ topLevelFilters: ["sets", "markers"] });
      expect(result.topLevelFilters).toEqual(["sets", "markers"]);
    });

    it("drops non-string and empty entries and de-duplicates", () => {
      const result = sanitizeServerResponse({
        topLevelFilters: ["sets", "", 7, "sets", null, "owned"],
      });
      expect(result.topLevelFilters).toEqual(["sets", "owned"]);
    });

    it("yields null for a non-array value so hydration keeps the local value", () => {
      const result = sanitizeServerResponse({ topLevelFilters: "sets" });
      expect(result.topLevelFilters).toBeNull();
    });

    it("omits the field entirely when the server didn't send it", () => {
      const result = sanitizeServerResponse({ showImages: true });
      expect("topLevelFilters" in result).toBe(false);
    });

    it("ignores the retired hiddenFilterSections key", () => {
      const result = sanitizeServerResponse({ hiddenFilterSections: ["superTypes"] });
      expect("topLevelFilters" in result).toBe(false);
    });
  });

  describe("sanitizeOverrides (localStorage)", () => {
    it("reads topLevelFilters from the persisted overrides shape", () => {
      const { overrides } = sanitizeOverrides({ overrides: { topLevelFilters: ["domains"] } });
      expect(overrides.topLevelFilters).toEqual(["domains"]);
    });

    it("defaults to null when absent", () => {
      const { overrides } = sanitizeOverrides({ overrides: { showImages: true } });
      expect(overrides.topLevelFilters).toBeNull();
    });

    it("ignores the retired hiddenFilterSections key", () => {
      const { overrides } = sanitizeOverrides({
        overrides: { hiddenFilterSections: ["energy"] },
      });
      expect(overrides.topLevelFilters).toBeNull();
    });
  });
});

describe("sanitize-preferences — languages", () => {
  describe("retired language codes", () => {
    it("rewrites a persisted ZH to SC", () => {
      const { overrides } = sanitizeOverrides({ overrides: { languages: ["ZH"] } });
      expect(overrides.languages).toEqual(["SC"]);
    });

    it("rewrites ZH from the server response too", () => {
      const result = sanitizeServerResponse({ languages: ["EN", "ZH"] });
      expect(result.languages).toEqual(["EN", "SC"]);
    });

    it("collapses ZH and SC to one entry rather than emitting a duplicate", () => {
      const { overrides } = sanitizeOverrides({ overrides: { languages: ["SC", "ZH"] } });
      expect(overrides.languages).toEqual(["SC"]);
    });

    it("remaps inside completionScope, which carries its own language list", () => {
      const result = sanitizeServerResponse({ completionScope: { languages: ["ZH"] } });
      expect(result.completionScope?.languages).toEqual(["SC"]);
    });

    it("leaves live codes untouched", () => {
      const { overrides } = sanitizeOverrides({ overrides: { languages: ["EN", "FR"] } });
      expect(overrides.languages).toEqual(["EN", "FR"]);
    });

    it("passes through unknown codes rather than dropping them", () => {
      const { overrides } = sanitizeOverrides({ overrides: { languages: ["JA"] } });
      expect(overrides.languages).toEqual(["JA"]);
    });

    it("still drops non-string and empty entries", () => {
      const { overrides } = sanitizeOverrides({
        overrides: { languages: ["ZH", "", 7, null, "EN"] },
      });
      expect(overrides.languages).toEqual(["SC", "EN"]);
    });

    it("yields null for a non-array value", () => {
      const { overrides } = sanitizeOverrides({ overrides: { languages: "ZH" } });
      expect(overrides.languages).toBeNull();
    });
  });
});

describe("sanitize-preferences — maxColumns", () => {
  it("keeps a stored number", () => {
    expect(sanitizeOverrides({ overrides: {}, maxColumns: 6 }).maxColumns).toBe(6);
  });

  it("keeps an explicit null, which means auto", () => {
    expect(sanitizeOverrides({ overrides: {}, maxColumns: null }).maxColumns).toBeNull();
  });

  it("yields undefined for a non-number so the store keeps its default", () => {
    expect(sanitizeOverrides({ overrides: {}, maxColumns: "6" }).maxColumns).toBeUndefined();
    expect(sanitizeOverrides({ overrides: {} }).maxColumns).toBeUndefined();
  });

  it("reads maxColumns from the legacy flat shape too", () => {
    expect(sanitizeOverrides({ showImages: true, maxColumns: 4 }).maxColumns).toBe(4);
  });
});

describe("sanitize-preferences — legacy flat persisted shape", () => {
  it("reads top-level fields when there is no overrides key", () => {
    const { overrides } = sanitizeOverrides({ showImages: false, defaultCurrency: "EUR" });

    expect(overrides.showImages).toBe(false);
    expect(overrides.defaultCurrency).toBe("EUR");
  });

  it("expands the retired richEffects flag onto the three granular settings", () => {
    const { overrides } = sanitizeOverrides({ richEffects: false });

    expect(overrides.fancyFan).toBe(false);
    expect(overrides.foilEffect).toBe(false);
    expect(overrides.cardTilt).toBe(false);
  });

  it("lets an explicit granular value win over richEffects", () => {
    const { overrides } = sanitizeOverrides({ richEffects: false, cardTilt: true });

    expect(overrides.cardTilt).toBe(true);
    expect(overrides.fancyFan).toBe(false);
  });

  it("leaves foilEffect unset when richEffects was on, since it has no tri-state answer", () => {
    const { overrides } = sanitizeOverrides({ richEffects: true });

    expect(overrides.fancyFan).toBe(true);
    expect(overrides.foilEffect).toBeNull();
  });

  it("collapses the old foilEffect tri-state onto a boolean", () => {
    expect(sanitizeOverrides({ foilEffect: "none" }).overrides.foilEffect).toBe(false);
    expect(sanitizeOverrides({ foilEffect: "static" }).overrides.foilEffect).toBe(true);
    expect(sanitizeOverrides({ foilEffect: "animated" }).overrides.foilEffect).toBe(true);
  });

  it("drops marketplaces that are not in the known set", () => {
    const { overrides } = sanitizeOverrides({ marketplaceOrder: ["cardmarket", "ebay"] });

    expect(overrides.marketplaceOrder).toEqual(["cardmarket"]);
  });

  it("returns all-null overrides for a non-object blob", () => {
    const { overrides } = sanitizeOverrides("not an object");

    expect(Object.values(overrides).every((value) => value === null)).toBe(true);
  });
});

describe("sanitizeCardsShowCounts", () => {
  it("prefers a stored boolean", () => {
    expect(sanitizeCardsShowCounts({ cardsShowCounts: false }, true)).toBe(false);
    expect(sanitizeCardsShowCounts({ cardsShowCounts: true }, false)).toBe(true);
  });

  it("migrates the legacy catalogMode tri-state", () => {
    expect(sanitizeCardsShowCounts({ catalogMode: "off" }, true)).toBe(false);
    expect(sanitizeCardsShowCounts({ catalogMode: "count" }, false)).toBe(true);
    expect(sanitizeCardsShowCounts({ catalogMode: "add" }, false)).toBe(true);
  });

  it("lets the new key win over a contradicting legacy one", () => {
    expect(sanitizeCardsShowCounts({ cardsShowCounts: false, catalogMode: "add" }, true)).toBe(
      false,
    );
  });

  it("falls back for an unknown catalogMode, a missing key or a non-object blob", () => {
    expect(sanitizeCardsShowCounts({ catalogMode: "sideways" }, true)).toBe(true);
    expect(sanitizeCardsShowCounts({}, true)).toBe(true);
    expect(sanitizeCardsShowCounts(null, false)).toBe(false);
    expect(sanitizeCardsShowCounts("off", true)).toBe(true);
  });
});

describe("sanitizeMetaDeckView", () => {
  it("keeps a value from the union", () => {
    expect(sanitizeMetaDeckView({ metaDeckView: "grid" }, "list")).toBe("grid");
    expect(sanitizeMetaDeckView({ metaDeckView: "list" }, "grid")).toBe("list");
  });

  it("falls back for anything outside the union", () => {
    expect(sanitizeMetaDeckView({ metaDeckView: "table" }, "list")).toBe("list");
    expect(sanitizeMetaDeckView({}, "grid")).toBe("grid");
    expect(sanitizeMetaDeckView(undefined, "list")).toBe("list");
  });
});

describe("sanitizeDisplayMode", () => {
  it("keeps a value from the union", () => {
    expect(sanitizeDisplayMode({ displayMode: "table" }, "grid")).toBe("table");
    expect(sanitizeDisplayMode({ displayMode: "grid" }, "table")).toBe("grid");
  });

  it("falls back for anything outside the union", () => {
    expect(sanitizeDisplayMode({ displayMode: "list" }, "grid")).toBe("grid");
    expect(sanitizeDisplayMode({ displayMode: 1 }, "table")).toBe("table");
    expect(sanitizeDisplayMode({}, "grid")).toBe("grid");
    expect(sanitizeDisplayMode(undefined, "table")).toBe("table");
  });
});

describe("sanitizeFiltersExpanded", () => {
  it("keeps a stored boolean", () => {
    expect(sanitizeFiltersExpanded({ filtersExpanded: true }, false)).toBe(true);
    expect(sanitizeFiltersExpanded({ filtersExpanded: false }, true)).toBe(false);
  });

  it("falls back for a non-boolean or a missing key", () => {
    expect(sanitizeFiltersExpanded({ filtersExpanded: "yes" }, false)).toBe(false);
    expect(sanitizeFiltersExpanded({}, true)).toBe(true);
    expect(sanitizeFiltersExpanded(null, true)).toBe(true);
  });
});

describe("sanitizePaneDocked", () => {
  it("keeps a stored boolean", () => {
    expect(sanitizePaneDocked({ paneDocked: true }, false)).toBe(true);
    expect(sanitizePaneDocked({ paneDocked: false }, true)).toBe(false);
  });

  it("falls back for a non-boolean or a missing key", () => {
    expect(sanitizePaneDocked({ paneDocked: "yes" }, false)).toBe(false);
    expect(sanitizePaneDocked(null, false)).toBe(false);
  });

  it("leaves blobs written before the pane became opt-in on the default", () => {
    expect(sanitizePaneDocked({ displayMode: "grid", filtersExpanded: true }, false)).toBe(false);
  });
});

describe("sanitizeTierTileStep", () => {
  it("keeps a step inside the ladder", () => {
    expect(sanitizeTierTileStep({ tierTileStep: 4 }, 6, 2)).toBe(4);
    expect(sanitizeTierTileStep({ tierTileStep: 0 }, 6, 2)).toBe(0);
  });

  it("falls back for a step past the end of the ladder", () => {
    expect(sanitizeTierTileStep({ tierTileStep: 9 }, 6, 2)).toBe(2);
    expect(sanitizeTierTileStep({ tierTileStep: -1 }, 6, 2)).toBe(2);
  });

  it("falls back for a non-integer, a non-number, or a missing key", () => {
    expect(sanitizeTierTileStep({ tierTileStep: 1.5 }, 6, 2)).toBe(2);
    expect(sanitizeTierTileStep({ tierTileStep: "3" }, 6, 2)).toBe(2);
    expect(sanitizeTierTileStep({ displayMode: "grid" }, 6, 2)).toBe(2);
    expect(sanitizeTierTileStep(null, 6, 2)).toBe(2);
  });
});

describe("sanitizeThemePreference", () => {
  it("keeps a stored preference", () => {
    expect(sanitizeThemePreference({ preference: "dark" })).toBe("dark");
    expect(sanitizeThemePreference({ preference: "light" })).toBe("light");
    expect(sanitizeThemePreference({ preference: "auto" })).toBe("auto");
  });

  it("migrates the legacy theme key", () => {
    expect(sanitizeThemePreference({ theme: "dark" })).toBe("dark");
  });

  it("lets the new key win when both are present", () => {
    expect(sanitizeThemePreference({ preference: "light", theme: "dark" })).toBe("light");
  });

  it("treats an explicit null preference as set, not as a missing key", () => {
    expect(sanitizeThemePreference({ preference: null, theme: "dark" })).toBeNull();
  });

  it("coerces an invalid value to null so the default applies", () => {
    expect(sanitizeThemePreference({ preference: "sepia" })).toBeNull();
    expect(sanitizeThemePreference({ theme: 1 })).toBeNull();
    expect(sanitizeThemePreference({})).toBeNull();
    expect(sanitizeThemePreference(null)).toBeNull();
  });
});
