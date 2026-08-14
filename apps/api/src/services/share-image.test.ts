import { describe, expect, it } from "vitest";

import { defaultIo } from "../io.js";
import type { ShareImageCard } from "./share-image.js";
import { markPlacement, renderShareImage } from "./share-image.js";

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

  it("renders a two-row list, where the mark takes a trailing cell", async () => {
    const png = await renderShareImage(defaultIo, {
      ownerName: "Alice",
      unit: { one: "printing", many: "printings" },
      title: "Nine printings",
      intentLabel: "Trade list",
      cards: nameOnlyCards(9),
      totalCount: 9,
      siteHost: "openrift.app",
      shareUrl: "https://openrift.app/lists/share/sampletoken",
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders the footer QR when a share URL is given", async () => {
    const png = await renderShareImage(defaultIo, {
      ownerName: "Alice",
      unit: { one: "printing", many: "printings" },
      title: "Bilgewater trade binder",
      intentLabel: "Trade list",
      cards: nameOnlyCards(8),
      totalCount: 8,
      siteHost: "openrift.app",
      shareUrl: "https://openrift.app/lists/share/sampletoken",
    });
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it("renders without a footer when there is neither host nor share URL", async () => {
    const png = await renderShareImage(defaultIo, {
      ownerName: "Alice",
      unit: { one: "card", many: "cards" },
      title: "Unshared list",
      intentLabel: "Wishlist",
      cards: nameOnlyCards(4),
      totalCount: 4,
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("elides a title longer than the cap rather than overrunning the count", async () => {
    const png = await renderShareImage(defaultIo, {
      ownerName: "Alice",
      unit: { one: "card", many: "cards" },
      title: "A list name far longer than the forty-six character cap allows",
      intentLabel: "Wishlist",
      cards: nameOnlyCards(4),
      totalCount: 4,
      siteHost: "openrift.app",
    });
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1200);
  });

  it("renders the 2x variant at 2400x1260", async () => {
    const png = await renderShareImage(
      defaultIo,
      {
        ownerName: "Alice",
        unit: { one: "card", many: "cards" },
        title: "Holiday Targets",
        intentLabel: "Trade list",
        cards: nameOnlyCards(5),
        totalCount: 5,
        siteHost: "openrift.app",
        shareUrl: "https://openrift.app/lists/share/sampletoken",
      },
      2,
    );
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(2400);
    expect(meta.height).toBe(1260);
  });
});

// The live geometry: 1200x630 canvas, 24px padding, a 52px title row and a 10px
// gap above the grid.
const AREA_W = 1152;
const AREA_H = 520;

describe("markPlacement", () => {
  it("rides in the overflow tile, which the grid already spends a cell on", () => {
    expect(markPlacement(11, true, true, AREA_W, AREA_H)).toBe("tile");
  });

  it("still builds the overflow tile when there is no mark to put in it", () => {
    expect(markPlacement(11, true, false, AREA_W, AREA_H)).toBe("tile");
  });

  it("goes nowhere when the list neither overflows nor has anything to link to", () => {
    expect(markPlacement(5, false, false, AREA_W, AREA_H)).toBe("none");
  });

  it("uses the footer for a one-row grid, where the cards are width-bound", () => {
    // Five cards fill the width long before they fill the height, so the band
    // below them costs nothing.
    expect(markPlacement(5, false, true, AREA_W, AREA_H)).toBe("footer");
  });

  it("takes a trailing cell for a two-row grid, where the cards are height-bound", () => {
    expect(markPlacement(9, false, true, AREA_W, AREA_H)).toBe("cell");
  });

  it("never shrinks the cards below what the other placement would give", () => {
    for (let cards = 1; cards <= 12; cards++) {
      const placement = markPlacement(cards, false, true, AREA_W, AREA_H);
      const asFooter = computeGridForTest(cards, AREA_W, AREA_H - 84 - 10);
      const asCell = computeGridForTest(cards + 1, AREA_W, AREA_H);
      const chosen = placement === "footer" ? asFooter : asCell;
      expect(chosen).toBeGreaterThanOrEqual(Math.max(asFooter, asCell));
    }
  });
});

/**
 * Mirrors the renderer's grid sizing so the placement test can assert on the
 * resulting card width without exporting the grid packer itself.
 * @returns The cell width the grid would produce.
 */
function computeGridForTest(count: number, areaW: number, areaH: number): number {
  const rows = count <= 6 ? 1 : 2;
  const cols = Math.ceil(count / rows);
  const cellWByWidth = (areaW - (cols - 1) * 12) / cols;
  const cellHByHeight = (areaH - (rows - 1) * 12) / rows;
  return Math.floor(Math.floor(Math.min(cellHByHeight, cellWByWidth / 0.715)) * 0.715);
}
