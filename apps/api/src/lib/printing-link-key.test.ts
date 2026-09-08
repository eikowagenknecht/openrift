/* oxlint-disable no-restricted-imports -- api has no @/ alias */
import { describe, expect, it } from "vitest";

import { buildPrintingLinkKey } from "./printing-link-key.js";

describe("buildPrintingLinkKey", () => {
  it("uppercases the short code so source casing never blocks a match", () => {
    expect(
      buildPrintingLinkKey({
        shortCode: "ven-sp3",
        finish: "foil",
        markerSlugs: [],
        language: "EN",
      }),
    ).toBe("VEN-SP3:foil::EN");
  });

  it("sorts marker slugs so payload order never blocks a match", () => {
    const a = buildPrintingLinkKey({
      shortCode: "OGN-001",
      finish: "normal",
      markerSlugs: ["promo", "launch-exclusive"],
      language: "EN",
    });
    const b = buildPrintingLinkKey({
      shortCode: "OGN-001",
      finish: "normal",
      markerSlugs: ["launch-exclusive", "promo"],
      language: "EN",
    });
    expect(a).toBe(b);
    expect(a).toBe("OGN-001:normal:launch-exclusive,promo:EN");
  });

  it("defaults a missing language to EN", () => {
    expect(
      buildPrintingLinkKey({
        shortCode: "OGN-001",
        finish: "normal",
        markerSlugs: [],
        language: null,
      }),
    ).toBe("OGN-001:normal::EN");
  });
});
