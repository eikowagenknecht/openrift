import { describe, expect, it } from "vitest";

import { sanitizeOverrides, sanitizeServerResponse } from "./sanitize-preferences";

describe("sanitize-preferences — hiddenFilterSections", () => {
  describe("sanitizeServerResponse", () => {
    it("keeps a valid array of section keys", () => {
      const result = sanitizeServerResponse({ hiddenFilterSections: ["price", "markers"] });
      expect(result.hiddenFilterSections).toEqual(["price", "markers"]);
    });

    it("drops non-string and empty entries and de-duplicates", () => {
      const result = sanitizeServerResponse({
        hiddenFilterSections: ["price", "", 7, "price", null, "owned"],
      });
      expect(result.hiddenFilterSections).toEqual(["price", "owned"]);
    });

    it("yields null for a non-array value so hydration keeps the local value", () => {
      const result = sanitizeServerResponse({ hiddenFilterSections: "price" });
      expect(result.hiddenFilterSections).toBeNull();
    });

    it("omits the field entirely when the server didn't send it", () => {
      const result = sanitizeServerResponse({ showImages: true });
      expect("hiddenFilterSections" in result).toBe(false);
    });
  });

  describe("sanitizeOverrides (localStorage)", () => {
    it("reads hiddenFilterSections from the persisted overrides shape", () => {
      const { overrides } = sanitizeOverrides({ overrides: { hiddenFilterSections: ["energy"] } });
      expect(overrides.hiddenFilterSections).toEqual(["energy"]);
    });

    it("defaults to null when absent", () => {
      const { overrides } = sanitizeOverrides({ overrides: { showImages: true } });
      expect(overrides.hiddenFilterSections).toBeNull();
    });
  });
});
