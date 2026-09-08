import { describe, expect, it } from "vitest";

import { deskImageSrc } from "./printing-desk-image";

describe("deskImageSrc", () => {
  it("appends the variant to a rehosted path", () => {
    expect(deskImageSrc("/media/cards/40/abc-40", "240w")).toBe("/media/cards/40/abc-40-240w.webp");
  });

  it("returns a source URL unchanged", () => {
    expect(deskImageSrc("https://example.com/card.png", "full")).toBe(
      "https://example.com/card.png",
    );
  });

  it("passes null through", () => {
    expect(deskImageSrc(null, "120w")).toBeNull();
  });
});
