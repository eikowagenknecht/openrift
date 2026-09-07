import type { CardLabels } from "@openrift/shared/scan/labels";
import { describe, expect, it } from "vitest";

import { describeKey, isLandscapeKey } from "@/lib/scan-bank";

const labels: CardLabels = {
  battlefield: { name: "Star Spring", code: "OGN-286/298", language: "en", type: "battlefield" },
  unit: { name: "Lux", code: "OGN-011/298", language: "en", type: "unit" },
  untyped: { name: "Unknown Render", code: "OGN-999/298", language: "en" },
};

describe("describeKey", () => {
  it("names a labelled key", () => {
    expect(describeKey(labels, "unit")).toBe("Lux (OGN-011/298 en)");
  });

  it("falls back to a short key when the label is missing", () => {
    expect(describeKey(labels, "0123456789abcdef")).toBe("unknown 01234567");
  });
});

describe("isLandscapeKey", () => {
  it("reports Battlefield art as landscape", () => {
    expect(isLandscapeKey(labels, "battlefield")).toBe(true);
  });

  it("reports every other card type as portrait", () => {
    expect(isLandscapeKey(labels, "unit")).toBe(false);
  });

  it("reports portrait for a label predating the type field", () => {
    expect(isLandscapeKey(labels, "untyped")).toBe(false);
  });

  it("reports portrait for an unlabelled key", () => {
    expect(isLandscapeKey(labels, "missing")).toBe(false);
  });
});
