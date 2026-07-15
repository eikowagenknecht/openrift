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

describe("sanitize-preferences — languages", () => {
  // Migration 204 renamed ZH to SC in the database. localStorage is out of a
  // migration's reach, so a returning user's persisted "ZH" has to be remapped
  // on read or it filters on a code no printing carries — an empty grid with an
  // active filter chip and no error anywhere.
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
      // The preferences contract rejects duplicates, so a user holding both the
      // old and new code must not end up with ["SC", "SC"].
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
      // Languages are DB rows, not a compile-time enum — an admin can add one
      // any time, so an unrecognized code is not necessarily a stale one.
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
