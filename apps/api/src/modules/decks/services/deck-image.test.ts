import { describe, expect, it } from "vitest";

import { defaultIo } from "../../../io.js";
import type { DeckImageCard } from "./deck-image.js";
import { renderDeckImage, truncateTitle } from "./deck-image.js";

// Exercises the real pipeline (font load + glyph rasterize + QR + satori + sharp), no DB or media.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Canvas geometry mirrored from deck-image.ts, to locate the QR mark in output.
const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 22;
const HEADER_QR_SIZE = 104;
/** Gap below the title row, `GAP` in deck-image-parts.ts. */
const TITLE_GAP = 10;

function card(
  cardName: string,
  zone: string,
  quantity = 1,
  energy: number | null = null,
  domains: string[] = [],
): DeckImageCard {
  return { cardName, zone, quantity, energy, domains, imageId: null };
}

const constructedDeck: DeckImageCard[] = [
  card("Scorn of the Moon", "legend", 1, null, ["order"]),
  ...Array.from({ length: 6 }, () => card("Order Rune", "runes", 1, null, ["order"])),
  ...Array.from({ length: 6 }, () => card("Fury Rune", "runes", 1, null, ["fury"])),
  card("Targon's Peak", "battlefield"),
  card("Abandoned Hall", "battlefield"),
  card("Diana", "champion", 3, 3),
  card("Gust", "main", 3, 1),
  card("Flash", "main", 3, 2),
  card("Hwei", "main", 3, 5),
  card("Singularity", "sideboard", 2, 6),
];

const baseInput = {
  deckName: "Best of Diana",
  ownerName: "drawphasetcg",
  formatLabel: "Constructed",
  siteHost: "openrift.app",
  shareUrl: "https://openrift.app/decks/share/sampletoken",
};

describe("renderDeckImage", () => {
  it("renders a valid PNG for a full constructed deck", async () => {
    const png = await renderDeckImage(defaultIo, { ...baseInput, cards: constructedDeck });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it("renders a freeform deck with no Legend (left panel collapses)", async () => {
    const cards = [card("Lightning Strike", "main", 3, 2), card("Fireball", "main", 2, 4)];
    const png = await renderDeckImage(defaultIo, { ...baseInput, formatLabel: "Freeform", cards });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders an empty deck as a placeholder without throwing", async () => {
    const png = await renderDeckImage(defaultIo, { ...baseInput, cards: [] });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders the HQ variant at 2× resolution from the same layout", async () => {
    const png = await renderDeckImage(defaultIo, { ...baseInput, cards: constructedDeck }, 2);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(2400);
    expect(meta.height).toBe(1260);
  }, 30_000); // The 2× canvas (2400×1260) is heavy to rasterize; generous for cold CI.

  it("renders without a QR when no share URL is given", async () => {
    const png = await renderDeckImage(defaultIo, {
      ...baseInput,
      shareUrl: undefined,
      cards: constructedDeck,
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders the QR dark-on-white so the code is not inverted", async () => {
    const png = await renderDeckImage(defaultIo, { ...baseInput, cards: constructedDeck });
    const { data, info } = await defaultIo
      .sharp(png)
      .extract({
        left: WIDTH - PAD - HEADER_QR_SIZE,
        top: PAD,
        width: HEADER_QR_SIZE,
        height: HEADER_QR_SIZE,
      })
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

    // Gold-on-transparent over the #14161d background tops out around 205 per channel.
    expect(white).toBeGreaterThan(HEADER_QR_SIZE * HEADER_QR_SIZE * 0.2);
  });

  it("leaves the title row's right end clear when there is no share link", async () => {
    const png = await renderDeckImage(defaultIo, {
      ...baseInput,
      shareUrl: undefined,
      cards: constructedDeck,
    });
    const { data, info } = await defaultIo
      .sharp(png)
      .extract({
        left: WIDTH - PAD - HEADER_QR_SIZE,
        top: PAD,
        width: HEADER_QR_SIZE,
        height: HEADER_QR_SIZE,
      })
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

    // Card art reaches into this box once the row is short, so allow a little
    // near-white; a drawn mark's plate would be orders of magnitude more.
    expect(white).toBeLessThan(HEADER_QR_SIZE * HEADER_QR_SIZE * 0.02);
  });

  it("renders without the owner chip when no owner name is given (logged-out local deck)", async () => {
    const png = await renderDeckImage(defaultIo, {
      ...baseInput,
      ownerName: undefined,
      cards: constructedDeck,
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders an archive result line without moving the deck body", async () => {
    const cards = constructedDeck;
    const [plain, archived] = await Promise.all([
      renderDeckImage(defaultIo, { ...baseInput, cards }),
      renderDeckImage(defaultIo, {
        ...baseInput,
        cards,
        resultLine: "1st of 3,283 · 14-1-0 · Summoner Skirmish Wuhan",
      }),
    ]);
    expect(archived.subarray(0, 8)).toEqual(PNG_MAGIC);
    expect(archived).not.toEqual(plain);

    const bodyTop = PAD + HEADER_QR_SIZE + TITLE_GAP;
    const box = { left: 0, top: bodyTop, width: WIDTH, height: HEIGHT - bodyTop };
    const [plainBody, archivedBody] = await Promise.all([
      defaultIo.sharp(plain).extract(box).raw().toBuffer(),
      defaultIo.sharp(archived).extract(box).raw().toBuffer(),
    ]);
    expect(archivedBody).toEqual(plainBody);
  }, 30_000); // Two full-canvas renders plus two raw extracts; generous for cold CI.
});

describe("renderDeckImage (vertical)", () => {
  it("renders the 9:16 export at 1080x1920", async () => {
    const png = await renderDeckImage(
      defaultIo,
      { ...baseInput, cards: constructedDeck },
      1,
      "vertical",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it("renders a freeform deck with no Legend (the identity band collapses)", async () => {
    const cards = [
      card("Lightning Strike", "main", 3, 2),
      card("Fireball", "main", 2, 4),
      card("Targon's Peak", "battlefield"),
    ];
    const png = await renderDeckImage(
      defaultIo,
      { ...baseInput, formatLabel: "Freeform", cards },
      1,
      "vertical",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders an empty deck as a placeholder without throwing", async () => {
    const png = await renderDeckImage(defaultIo, { ...baseInput, cards: [] }, 1, "vertical");
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders without a QR or an owner when neither is given", async () => {
    const png = await renderDeckImage(
      defaultIo,
      { ...baseInput, shareUrl: undefined, ownerName: undefined, cards: constructedDeck },
      1,
      "vertical",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders an archive result line as a third title line", async () => {
    const png = await renderDeckImage(
      defaultIo,
      {
        ...baseInput,
        cards: constructedDeck,
        resultLine: "1st of 3,283 · 14-1-0 · Summoner Skirmish Wuhan",
      },
      1,
      "vertical",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it("renders the 2× variant at 2160x3840", async () => {
    const png = await renderDeckImage(
      defaultIo,
      { ...baseInput, cards: constructedDeck },
      2,
      "vertical",
    );
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(2160);
    expect(meta.height).toBe(3840);
  }, 30_000); // 2160×3840 is the heaviest canvas here; generous for cold CI.
});

describe("truncateTitle", () => {
  it("leaves short titles untouched", () => {
    expect(truncateTitle("Azir UNL - Current")).toBe("Azir UNL - Current");
  });

  it("elides overly long titles to a single ellipsis", () => {
    const long = "A".repeat(40);
    const result = truncateTitle(long);
    expect(result.length).toBeLessThanOrEqual(34);
    expect(result.endsWith("…")).toBe(true);
  });

  it("trims trailing space before the ellipsis", () => {
    const title = `${"word ".repeat(8)}tail`; // spaces land near the cut
    expect(truncateTitle(title)).not.toContain(" …");
  });
});
