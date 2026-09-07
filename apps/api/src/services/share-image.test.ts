import { describe, expect, it } from "vitest";

import { defaultIo } from "../io.js";
import type { ShareImageCard } from "./share-image.js";
import { bestGridForArea, markPlacement, renderShareImage } from "./share-image.js";

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

  it("keeps the host but drops the code when the mark is turned off", async () => {
    const png = await renderShareImage(
      defaultIo,
      {
        ownerName: "Alice",
        unit: { one: "card", many: "cards" },
        title: "Clean plate",
        intentLabel: "Trade list",
        cards: nameOnlyCards(9),
        totalCount: 9,
        siteHost: "openrift.app",
        shareUrl: "https://openrift.app/lists/share/sampletoken",
      },
      1,
      { qr: false },
    );
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
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

describe("renderShareImage (vertical)", () => {
  it("renders the 9:16 canvas at 1080x1920", async () => {
    const png = await renderShareImage(
      defaultIo,
      {
        ownerName: "Alice",
        unit: { one: "card", many: "cards" },
        title: "Holiday Targets",
        intentLabel: "Trade list",
        cards: nameOnlyCards(9),
        totalCount: 9,
        siteHost: "openrift.app",
        shareUrl: "https://openrift.app/lists/share/sampletoken",
      },
      1,
      { aspect: "vertical" },
    );
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it("renders beyond the vertical tile cap (the '+N more' tile) without throwing", async () => {
    const png = await renderShareImage(
      defaultIo,
      {
        ownerName: "Alice",
        unit: { one: "printing", many: "printings" },
        title: "Bilgewater trade binder",
        intentLabel: "Trade list",
        cards: nameOnlyCards(40),
        totalCount: 40,
        siteHost: "openrift.app",
        shareUrl: "https://openrift.app/lists/share/sampletoken",
      },
      1,
      { aspect: "vertical" },
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders an empty list on the tall canvas without throwing", async () => {
    const png = await renderShareImage(
      defaultIo,
      {
        ownerName: "",
        unit: { one: "card", many: "cards" },
        title: "Empty",
        intentLabel: "Wishlist",
        cards: [],
        totalCount: 0,
      },
      1,
      { aspect: "vertical" },
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders the 2x vertical variant at 2160x3840", async () => {
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
      },
      2,
      { aspect: "vertical", qr: false },
    );
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(2160);
    expect(meta.height).toBe(3840);
  }, 30_000); // 2160×3840 is the heaviest canvas here; generous for cold CI.
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
    expect(markPlacement(5, false, true, AREA_W, AREA_H)).toBe("footer");
  });

  it("takes a trailing cell for a two-row grid, where the cards are height-bound", () => {
    expect(markPlacement(9, false, true, AREA_W, AREA_H)).toBe("cell");
  });

  it("takes the footer rather than a cell when the mark carries no code", () => {
    expect(markPlacement(9, false, true, AREA_W, AREA_H, false)).toBe("footer");
    expect(markPlacement(5, false, true, AREA_W, AREA_H, false)).toBe("footer");
  });

  it("still rides the overflow tile with the code off", () => {
    expect(markPlacement(11, true, true, AREA_W, AREA_H, false)).toBe("tile");
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

// The live vertical geometry: 1080x1920 canvas, 28px padding, a 132px title
// block (the QR sets its height), a 10px gap, and a 32px footer with its gap.
const V_AREA_W = 1024;
const V_AREA_H = 1680;
const V_GAP = 14;

describe("bestGridForArea", () => {
  it("packs the vertical cap into four columns, wider than a landscape tile", () => {
    const grid = bestGridForArea(20, V_AREA_W, V_AREA_H, V_GAP);

    expect(grid.cols).toBe(4);
    expect(grid.cellW).toBeGreaterThan(181);
  });

  it("picks the columns that make the tiles largest, not a fixed row count", () => {
    for (const count of [1, 2, 3, 5, 8, 12, 17, 20]) {
      const best = bestGridForArea(count, V_AREA_W, V_AREA_H, V_GAP);
      for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const byWidth = (V_AREA_W - (cols - 1) * V_GAP) / cols;
        const byHeight = (V_AREA_H - (rows - 1) * V_GAP) / rows;
        const cellW = Math.floor(Math.floor(Math.min(byHeight, byWidth / 0.715)) * 0.715);
        expect(best.cellW).toBeGreaterThanOrEqual(cellW);
      }
    }
  });

  it("still returns a drawable cell for an empty grid", () => {
    const grid = bestGridForArea(0, V_AREA_W, V_AREA_H, V_GAP);

    expect(grid.cols).toBe(1);
    expect(grid.cellW).toBeGreaterThan(0);
  });
});

/** Mirrors the renderer's grid sizing without exporting the grid packer itself. */
function computeGridForTest(count: number, areaW: number, areaH: number): number {
  const rows = count <= 6 ? 1 : 2;
  const cols = Math.ceil(count / rows);
  const cellWByWidth = (areaW - (cols - 1) * 12) / cols;
  const cellHByHeight = (areaH - (rows - 1) * 12) / rows;
  return Math.floor(Math.floor(Math.min(cellHByHeight, cellWByWidth / 0.715)) * 0.715);
}
