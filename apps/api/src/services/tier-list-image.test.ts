import { describe, expect, it } from "vitest";

import { defaultIo } from "../io.js";
import type { TierListImageRow } from "./tier-list-image.js";
import {
  fitRowLabel,
  fitRowLabelToChip,
  measureBoard,
  measureWrappedBoard,
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
  }, 30_000); // 200 chips is the widest layout here; it ran 4.3s on CI before this.

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

  it("draws the code at the title row's right end, and nothing there without one", async () => {
    // Canvas geometry mirrored from tier-list-image.ts. The title row is as tall
    // as the mark, so the mark's box starts at the padding on both axes.
    const WIDTH = 1200;
    const PAD = 24;
    const HEADER_QR = 104;

    const whiteInMarkBox = async (png: Buffer): Promise<number> => {
      const { data, info } = await defaultIo
        .sharp(png)
        .extract({ left: WIDTH - PAD - HEADER_QR, top: PAD, width: HEADER_QR, height: HEADER_QR })
        .raw()
        .toBuffer({ resolveWithObject: true });
      let white = 0;
      for (let offset = 0; offset < data.length; offset += info.channels) {
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        if (red >= 240 && green >= 240 && blue >= 240) {
          white++;
        }
      }
      return white;
    };

    const [withQr, withoutQr] = await Promise.all([
      renderTierListImage(defaultIo, { ...baseInput, rows: defaultBoard }),
      renderTierListImage(defaultIo, { ...baseInput, shareUrl: undefined, rows: defaultBoard }),
    ]);

    // The code is dark-on-white, so its light plate fills much of the box.
    expect(await whiteInMarkBox(withQr)).toBeGreaterThan(HEADER_QR * HEADER_QR * 0.2);
    expect(await whiteInMarkBox(withoutQr)).toBeLessThan(HEADER_QR * HEADER_QR * 0.02);
  });

  it("renders the 2x variant at 2400x1260", async () => {
    const png = await renderTierListImage(defaultIo, { ...baseInput, rows: defaultBoard }, 2);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(2400);
    expect(meta.height).toBe(1260);
  }, 30_000); // The 2× canvas rasterizes for a second locally; generous for cold CI.

  it("renders the vertical export at 1080x1920", async () => {
    const png = await renderTierListImage(
      defaultIo,
      { ...baseInput, rows: defaultBoard },
      1,
      "vertical",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  }, 30_000); // The tall canvas is close behind the 2× one; generous for cold CI.

  it("renders the vertical export at 2x", async () => {
    const png = await renderTierListImage(
      defaultIo,
      { ...baseInput, rows: defaultBoard },
      2,
      "vertical",
    );
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(2160);
    expect(meta.height).toBe(3840);
  }, 30_000); // 2160×3840 is the heaviest canvas here; generous for a loaded suite.

  it("renders a vertical board with empty rows, no rows, and no footer", async () => {
    for (const rows of [[row("S", 0), row("A", 0)], []]) {
      const png = await renderTierListImage(defaultIo, { title: "Untitled", rows }, 1, "vertical");
      expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    }
  });

  it("renders a vertical row far wider than the wrap allowance (overflow chip)", async () => {
    const png = await renderTierListImage(
      defaultIo,
      { ...baseInput, rows: [row("S", 200)] },
      1,
      "vertical",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  }, 30_000); // Same 200 chips, wrapped onto the taller canvas.

  it("keeps the maximum row count inside the vertical canvas", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => row(`T${index}`, 9));
    const png = await renderTierListImage(defaultIo, { ...baseInput, rows }, 1, "vertical");
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.height).toBe(1920);
  }, 30_000); // 12 rows of 9 is the most chips any test lays out.
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

describe("measureWrappedBoard", () => {
  // The vertical canvas's board area: 1080 wide less padding, and what is left
  // of 1920 after the title block and the footer.
  const AREA_W = 1024;
  const AREA_H = 1668;
  const LABEL_W = 88;
  const ROW_GAP = 8;

  function totalHeight(rowHeights: readonly number[]): number {
    return (
      rowHeights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, rowHeights.length - 1) * ROW_GAP
    );
  }

  it("fits the board inside the available height", () => {
    const metrics = measureWrappedBoard([4, 7, 11, 6, 2], AREA_W, AREA_H, LABEL_W, 3);
    expect(totalHeight(metrics.rowHeights)).toBeLessThanOrEqual(AREA_H);
  });

  it("wraps a crowded row onto more lines than a sparse one", () => {
    const metrics = measureWrappedBoard([2, 20], AREA_W, AREA_H, LABEL_W, 3);
    expect(metrics.linesPerRow[1]).toBeGreaterThan(metrics.linesPerRow[0] ?? 0);
  });

  it("never exceeds the line allowance", () => {
    const metrics = measureWrappedBoard([200, 200, 200], AREA_W, AREA_H, LABEL_W, 3);
    for (const lines of metrics.linesPerRow) {
      expect(lines).toBeLessThanOrEqual(3);
    }
  });

  it("gives every row one line even when it holds no cards", () => {
    const metrics = measureWrappedBoard([0, 0, 0], AREA_W, AREA_H, LABEL_W, 3);
    expect(metrics.linesPerRow).toEqual([1, 1, 1]);
  });

  it("makes tiles bigger than dividing the height evenly would", () => {
    const counts = [4, 7, 11, 6, 2];
    const wrapped = measureWrappedBoard(counts, AREA_W, AREA_H, LABEL_W, 3);
    const flat = measureBoard(counts.length, 11, AREA_W, AREA_H, LABEL_W);
    expect(wrapped.tileH).toBeGreaterThan(flat.tileH);
  });

  it("handles a board with no rows", () => {
    const metrics = measureWrappedBoard([], AREA_W, AREA_H, LABEL_W, 3);
    expect(metrics.linesPerRow).toEqual([]);
    expect(metrics.rowHeights).toEqual([]);
    expect(Number.isFinite(metrics.tileH)).toBe(true);
  });

  it("spends the wrap allowance down when the rows cannot all fit", () => {
    const metrics = measureWrappedBoard(
      Array.from({ length: 12 }, () => 30),
      1024,
      600,
      88,
      3,
    );
    expect(totalHeight(metrics.rowHeights)).toBeLessThanOrEqual(600);
    expect(Math.max(...metrics.linesPerRow)).toBe(1);
  });

  it("still returns drawable geometry when nothing fits", () => {
    const metrics = measureWrappedBoard(
      Array.from({ length: 40 }, () => 5),
      1024,
      200,
      88,
      3,
    );
    expect(metrics.tileH).toBeGreaterThan(0);
    expect(metrics.tileW).toBeGreaterThan(0);
    expect(metrics.tilesPerLine).toBeGreaterThanOrEqual(1);
  });
});

describe("fitRowLabelToChip", () => {
  it("leaves a default single-character label alone", () => {
    expect(fitRowLabelToChip("S", 88, 44)).toBe("S");
  });

  it("truncates a renamed label to the chip's width", () => {
    // 88px of chip at 44px type holds three average glyphs.
    expect(fitRowLabelToChip("Absolutely unplayable", 88, 44)).toBe("Abs");
  });

  it("fits more characters when the type is smaller", () => {
    expect(fitRowLabelToChip("Broken", 88, 20).length).toBeGreaterThan(
      fitRowLabelToChip("Broken", 88, 44).length,
    );
  });

  it("always keeps at least one character", () => {
    expect(fitRowLabelToChip("Trap", 10, 80)).toBe("T");
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
