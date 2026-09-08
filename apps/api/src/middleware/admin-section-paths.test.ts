import { describe, expect, it } from "vitest";

import { sectionAllowsRequest } from "./admin-section-paths";

describe("sectionAllowsRequest", () => {
  describe("custom-tags", () => {
    it.each([
      "/api/admin/v1/custom-tags",
      "/api/admin/v1/custom-tags/some-id",
      "/api/admin/v1/custom-tags/some-id/cards",
      "/api/admin/v1/custom-tags/assignments",
      "/api/admin/v1/custom-tag-categories",
      "/api/admin/v1/custom-tag-categories/some-id",
      "/api/admin/v1/cards/all-cards",
      "/api/admin/v1/cards/0197a1b2-0000-7000-a000-000000000001/custom-tags",
    ])("allows %s", (path) => {
      expect(sectionAllowsRequest("custom-tags", "GET", path)).toBe(true);
      expect(sectionAllowsRequest("custom-tags", "POST", path)).toBe(true);
    });

    it.each([
      "/api/admin/v1/custom-tags-evil",
      "/api/admin/v1/custom-tag-categories-evil",
      "/api/admin/v1/me",
      "/api/admin/v1/users",
      "/api/admin/v1/admin-grants",
      "/api/admin/v1/cards",
      "/api/admin/v1/cards/some-id",
      "/api/admin/v1/cards/some-id/custom-tags/extra",
      "/api/admin/v1/feature-flags",
      "/api/admin/v1/site-settings",
    ])("rejects %s", (path) => {
      expect(sectionAllowsRequest("custom-tags", "GET", path)).toBe(false);
    });
  });

  describe("products", () => {
    it.each([
      "/api/admin/v1/products",
      "/api/admin/v1/products/some-id",
      "/api/admin/v1/products/some-id/contents",
    ])("allows %s", (path) => {
      expect(sectionAllowsRequest("products", "GET", path)).toBe(true);
    });

    it.each([
      "/api/admin/v1/products-evil",
      "/api/admin/v1/custom-tags",
      "/api/admin/v1/users",
      "/api/admin/v1/cards/all-cards",
    ])("rejects %s", (path) => {
      expect(sectionAllowsRequest("products", "GET", path)).toBe(false);
    });

    it("does not leak products paths to other sections", () => {
      expect(sectionAllowsRequest("custom-tags", "GET", "/api/admin/v1/products")).toBe(false);
    });
  });

  describe("card-review", () => {
    it.each([
      "/api/admin/v1/cards",
      "/api/admin/v1/cards/all-cards",
      "/api/admin/v1/cards/distinct-artists",
      "/api/admin/v1/cards/some-card-slug",
      "/api/admin/v1/cards/new/some-name",
      "/api/admin/v1/provider-settings",
      "/api/admin/v1/markers",
      "/api/admin/v1/languages",
      "/api/admin/v1/distribution-channels",
      "/api/admin/v1/sets",
    ])("allows GET %s", (path) => {
      expect(sectionAllowsRequest("card-review", "GET", path)).toBe(true);
    });

    it.each([
      "/api/admin/v1/cards/new/some-name/accept",
      "/api/admin/v1/cards/some-card-id/accept-field",
      "/api/admin/v1/cards/printing/some-printing-id/accept-field",
      "/api/admin/v1/cards/some-card-id/accept-printing",
      "/api/admin/v1/cards/candidate-printings/some-id/set-image",
      "/api/admin/v1/cards/printing-images/some-image-id/activate",
      "/api/admin/v1/cards/printing-images/some-image-id/rotate",
      "/api/admin/v1/cards/printing-images/some-image-id/rehost",
      "/api/admin/v1/cards/printing-images/some-image-id/set-needs-trim",
    ])("allows POST %s", (path) => {
      expect(sectionAllowsRequest("card-review", "POST", path)).toBe(true);
    });

    it("allows PATCH on candidate printings but not DELETE (same path)", () => {
      const path = "/api/admin/v1/cards/candidate-printings/some-id";
      expect(sectionAllowsRequest("card-review", "PATCH", path)).toBe(true);
      expect(sectionAllowsRequest("card-review", "DELETE", path)).toBe(false);
    });

    it("allows GET on enum collections but not their POST create (same path)", () => {
      for (const path of [
        "/api/admin/v1/sets",
        "/api/admin/v1/markers",
        "/api/admin/v1/languages",
        "/api/admin/v1/distribution-channels",
      ]) {
        expect(sectionAllowsRequest("card-review", "GET", path)).toBe(true);
        expect(sectionAllowsRequest("card-review", "POST", path)).toBe(false);
      }
    });

    it.each([
      "/api/admin/v1/cards/export",
      "/api/admin/v1/cards/provider-stats",
      "/api/admin/v1/cards/provider-names",
    ])("rejects GET %s despite matching the card-detail shape", (path) => {
      expect(sectionAllowsRequest("card-review", "GET", path)).toBe(false);
    });

    it.each([
      ["POST", "/api/admin/v1/cards/some-id/check"],
      ["POST", "/api/admin/v1/cards/some-id/uncheck"],
      ["POST", "/api/admin/v1/cards/some-id/check-all"],
      ["POST", "/api/admin/v1/cards/candidate-printings/some-id/check"],
      ["POST", "/api/admin/v1/cards/candidate-printings/some-id/uncheck"],
      ["POST", "/api/admin/v1/cards/candidate-printings/check-all"],
      ["POST", "/api/admin/v1/ignored-candidates/cards"],
      ["DELETE", "/api/admin/v1/ignored-candidates/cards"],
      ["POST", "/api/admin/v1/cards/new/some-name/accept-favorites"],
      ["POST", "/api/admin/v1/cards/some-slug/accept-favorite-printings"],
      ["POST", "/api/admin/v1/cards/create"],
      ["POST", "/api/admin/v1/cards/some-id/printings"],
      ["POST", "/api/admin/v1/cards/some-id/rename"],
      ["POST", "/api/admin/v1/cards/new/some-name/link"],
      ["POST", "/api/admin/v1/cards/candidate-printings/some-id/copy"],
      ["POST", "/api/admin/v1/cards/candidate-printings/link"],
      ["DELETE", "/api/admin/v1/cards/printing/some-id"],
      ["POST", "/api/admin/v1/cards/some-id/errata"],
      ["DELETE", "/api/admin/v1/cards/some-id/errata"],
      ["POST", "/api/admin/v1/cards/errata/upload"],
      ["POST", "/api/admin/v1/cards/upload"],
      ["POST", "/api/admin/v1/cards/by-provider/some-provider/check"],
      ["DELETE", "/api/admin/v1/cards/by-provider/some-provider"],
      ["DELETE", "/api/admin/v1/cards/printing-images/some-id"],
      ["POST", "/api/admin/v1/cards/printing-images/some-id/unrehost"],
      ["POST", "/api/admin/v1/cards/printing/some-id/add-image-url"],
      ["POST", "/api/admin/v1/cards/printing/some-id/upload-image"],
      ["PATCH", "/api/admin/v1/provider-settings/some-provider"],
      ["PUT", "/api/admin/v1/provider-settings/reorder"],
      ["GET", "/api/admin/v1/unified-mappings"],
      ["GET", "/api/admin/v1/custom-tags"],
      ["GET", "/api/admin/v1/users"],
      ["GET", "/api/admin/v1/me"],
    ])("rejects %s %s", (method, path) => {
      expect(sectionAllowsRequest("card-review", method, path)).toBe(false);
    });
  });

  describe("printing-desk", () => {
    it.each([
      "/api/admin/v1/printing-desk/printings",
      "/api/admin/v1/printing-desk/printings/some-printing-id",
      "/api/admin/v1/printing-desk/printings/some-printing-id/post-image.png",
      "/api/admin/v1/printing-desk/cards/some-card-slug",
      "/api/admin/v1/printings/some-printing-id/citations",
      "/api/admin/v1/printings/some-printing-id/citations/some-citation-id",
    ])("allows every method on %s", (path) => {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
        expect(sectionAllowsRequest("printing-desk", method, path)).toBe(true);
      }
    });

    it.each([
      "/api/admin/v1/cards/all-cards",
      "/api/admin/v1/cards/distinct-artists",
      "/api/admin/v1/cards/some-card-slug",
      "/api/admin/v1/sets",
      "/api/admin/v1/markers",
      "/api/admin/v1/languages",
      "/api/admin/v1/finishes",
      "/api/admin/v1/distribution-channels",
    ])("allows GET %s", (path) => {
      expect(sectionAllowsRequest("printing-desk", "GET", path)).toBe(true);
    });

    it.each([
      "/api/admin/v1/markers",
      "/api/admin/v1/distribution-channels",
      "/api/admin/v1/cards/printing/some-printing-id/upload-image",
      "/api/admin/v1/cards/printing-images/some-image-id/activate",
      "/api/admin/v1/cards/printing-images/some-image-id/rotate",
    ])("allows POST %s", (path) => {
      expect(sectionAllowsRequest("printing-desk", "POST", path)).toBe(true);
    });

    it("allows deleting a printing image", () => {
      const path = "/api/admin/v1/cards/printing-images/some-image-id";
      expect(sectionAllowsRequest("printing-desk", "DELETE", path)).toBe(true);
    });

    it("allows creating markers and channels but not editing or deleting them", () => {
      for (const path of ["/api/admin/v1/markers", "/api/admin/v1/distribution-channels"]) {
        expect(sectionAllowsRequest("printing-desk", "POST", path)).toBe(true);
        expect(sectionAllowsRequest("printing-desk", "PUT", `${path}/reorder`)).toBe(false);
        expect(sectionAllowsRequest("printing-desk", "PATCH", `${path}/some-id`)).toBe(false);
        expect(sectionAllowsRequest("printing-desk", "DELETE", `${path}/some-id`)).toBe(false);
      }
    });

    it.each([
      "/api/admin/v1/cards/export",
      "/api/admin/v1/cards/provider-stats",
      "/api/admin/v1/cards/provider-names",
    ])("rejects GET %s despite matching the card-detail shape", (path) => {
      expect(sectionAllowsRequest("printing-desk", "GET", path)).toBe(false);
    });

    it.each([
      ["GET", "/api/admin/v1/printing-desk-evil"],
      ["GET", "/api/admin/v1/printing-desk-evil/printings"],
      ["GET", "/api/admin/v1/users"],
      ["GET", "/api/admin/v1/admin-grants"],
      ["GET", "/api/admin/v1/me"],
      ["GET", "/api/admin/v1/feature-flags"],
      ["GET", "/api/admin/v1/site-settings"],
      ["GET", "/api/admin/v1/cards"],
      ["GET", "/api/admin/v1/provider-settings"],
      ["GET", "/api/admin/v1/custom-tags"],
      ["POST", "/api/admin/v1/cards/some-card-id/printings"],
      ["POST", "/api/admin/v1/cards/some-card-id/accept-field"],
      ["POST", "/api/admin/v1/cards/printing-images/some-image-id/rehost"],
      ["DELETE", "/api/admin/v1/cards/printing/some-printing-id"],
      ["GET", "/api/admin/v1/printings/some-printing-id"],
      ["GET", "/api/admin/v1/printings/some-printing-id/citations/some-id/extra"],
    ])("rejects %s %s", (method, path) => {
      expect(sectionAllowsRequest("printing-desk", method, path)).toBe(false);
    });

    it("does not leak printing-desk paths to other sections", () => {
      for (const section of ["card-review", "card-tags", "custom-tags", "products"]) {
        expect(sectionAllowsRequest(section, "GET", "/api/admin/v1/printing-desk/printings")).toBe(
          false,
        );
      }
    });
  });

  it("fails closed for unknown section slugs", () => {
    expect(sectionAllowsRequest("not-a-section", "GET", "/api/admin/v1/custom-tags")).toBe(false);
    expect(sectionAllowsRequest("", "GET", "/api/admin/v1/custom-tags")).toBe(false);
  });
});
