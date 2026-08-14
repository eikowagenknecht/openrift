import { describe, expect, it } from "vitest";

import { defaultIo } from "../io.js";
import type { TierListImageRow } from "./tier-list-image.js";
import {
  fitRowLabel,
  measureBoard,
  renderTierListImage,
  truncateTierListTitle,
} from "./tier-list-image.js";

// Exercises the real pipeline (font load + QR + satori + resvg). No DB or
// media: a null imageId falls back to a name-only tile, which still renders.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function row(label: string, count: number): TierListImageRow {
  return {
    label,
    cards: Array.from({ length: count }, (_, index) => ({
      cardName: `${label} card ${index + 1}`,
      imageId: null,
    })),
  };
}

const baseInput = {
  title: "Origins — best commons",
  ownerName: "drawphasetcg",
  siteHost: "openrift.app",
  shareUrl: "https://openrift.app/tier-lists/share/sampletoken",
};

const defaultBoard: TierListImageRow[] = [
  row("S", 4),
  row("A", 7),
  row("B", 11),
  row("C", 6),
  row("D", 2),
];

describe("renderTierListImage", () => {
  it("renders a valid PNG for a filled board", async () => {
    const png = await renderTierListImage(defaultIo, { ...baseInput, rows: defaultBoard });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it("renders a board whose rows are all empty", async () => {
    const rows = [row("S", 0), row("A", 0), row("B", 0)];
    const png = await renderTierListImage(defaultIo, { ...baseInput, rows });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders a list with no rows at all", async () => {
    const png = await renderTierListImage(defaultIo, { ...baseInput, rows: [] });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders the maximum row count without overflowing the canvas", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => row(`T${index}`, 5));
    const png = await renderTierListImage(defaultIo, { ...baseInput, rows });
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.height).toBe(630);
  });

  it("renders a row far wider than the canvas (overflow chip path)", async () => {
    const png = await renderTierListImage(defaultIo, { ...baseInput, rows: [row("S", 200)] });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders without a QR when no share URL is given", async () => {
    const png = await renderTierListImage(defaultIo, {
      title: baseInput.title,
      siteHost: baseInput.siteHost,
      rows: defaultBoard,
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders with no footer at all", async () => {
    const png = await renderTierListImage(defaultIo, { title: "Untitled", rows: defaultBoard });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders the 2x variant at 2400x1260", async () => {
    const png = await renderTierListImage(defaultIo, { ...baseInput, rows: defaultBoard }, 2);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(2400);
    expect(meta.height).toBe(1260);
  });
});

describe("measureBoard", () => {
  it("gives every row the same tile size", () => {
    const metrics = measureBoard(5, 11, 1152, 454);
    expect(metrics.tileW).toBe(Math.floor(metrics.tileH * 0.715));
    expect(metrics.tileH).toBeGreaterThan(0);
  });

  it("shrinks tiles when a row is too wide to fit", () => {
    const roomy = measureBoard(5, 4, 1152, 454);
    const crowded = measureBoard(5, 60, 1152, 454);
    expect(crowded.tileH).toBeLessThan(roomy.tileH);
  });

  it("does not shrink below the height cap when every row fits", () => {
    const metrics = measureBoard(5, 1, 1152, 454);
    // Row height minus the row's vertical padding is the ceiling; a single-card
    // row must not be scaled up past it just because the width allows.
    expect(metrics.tileH).toBeLessThanOrEqual(metrics.rowH);
  });

  it("fits at least one tile per row even at the maximum row count", () => {
    const metrics = measureBoard(12, 400, 1152, 454);
    expect(metrics.maxTilesPerRow).toBeGreaterThanOrEqual(1);
    expect(metrics.tileH).toBeGreaterThanOrEqual(12);
  });

  it("handles a board with no cards without dividing by zero", () => {
    const metrics = measureBoard(5, 0, 1152, 454);
    expect(Number.isFinite(metrics.tileH)).toBe(true);
    expect(Number.isFinite(metrics.tileW)).toBe(true);
  });

  it("handles a board with no rows", () => {
    const metrics = measureBoard(0, 0, 1152, 454);
    expect(Number.isFinite(metrics.rowH)).toBe(true);
  });
});

describe("fitRowLabel", () => {
  it("leaves a default single-character label alone", () => {
    expect(fitRowLabel("S", 84)).toBe("S");
  });

  it("keeps a short renamed label whole", () => {
    expect(fitRowLabel("Trap", 84)).toBe("Trap");
  });

  it("truncates a label too long for the chip", () => {
    expect(fitRowLabel("Absolutely unplayable", 84)).toHaveLength(7);
  });

  it("still shows three characters on a very short row", () => {
    expect(fitRowLabel("Broken", 20)).toBe("Bro");
  });
});

describe("truncateTierListTitle", () => {
  it("leaves a short title alone", () => {
    expect(truncateTierListTitle("Origins tier list")).toBe("Origins tier list");
  });

  it("elides a title past the cap", () => {
    const long = "Every single common and uncommon in Origins ranked for limited";
    const result = truncateTierListTitle(long);
    expect(result).toHaveLength(46);
    expect(result.endsWith("…")).toBe(true);
  });
});
