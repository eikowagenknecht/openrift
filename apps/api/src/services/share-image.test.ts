import { describe, expect, it } from "vitest";

import { defaultIo } from "../io.js";
import type { ShareImageCard } from "./share-image.js";
import { renderShareImage } from "./share-image.js";

// Exercises the real pipeline (font load + satori + resvg). No DB or media
// needed: a null imageId falls back to a name-only tile, which still renders.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function nameOnlyCards(count: number): ShareImageCard[] {
  return Array.from({ length: count }, (_, index) => ({
    cardName: `Sample Card ${index + 1}`,
    quantity: (index % 3) + 1,
    imageId: null,
  }));
}

describe("renderShareImage", () => {
  it("renders a valid, non-trivial PNG for a typical list", async () => {
    const png = await renderShareImage(defaultIo, {
      ownerName: "Alice",
      unit: { one: "card", many: "cards" },
      title: "Holiday Targets",
      intentLabel: "Trade list",
      cards: nameOnlyCards(5),
      totalCount: 5,
      siteHost: "openrift.app",
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    expect(png.length).toBeGreaterThan(1000);
  });

  it("renders an empty list as a placeholder without throwing", async () => {
    const png = await renderShareImage(defaultIo, {
      ownerName: "Alice",
      unit: { one: "card", many: "cards" },
      title: "Empty",
      intentLabel: "Wishlist",
      cards: [],
      totalCount: 0,
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders beyond the tile cap (the '+N more' path) without throwing", async () => {
    const png = await renderShareImage(defaultIo, {
      ownerName: "Alice",
      unit: { one: "card", many: "cards" },
      title: "Big Trade List",
      intentLabel: "Trade list",
      cards: nameOnlyCards(40),
      totalCount: 40,
      siteHost: "openrift.app",
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });
});
