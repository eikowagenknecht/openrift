import { describe, expect, it } from "vitest";

import { sanitizeOverrides, sanitizeServerResponse } from "./sanitize-preferences";

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
