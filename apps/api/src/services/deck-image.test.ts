import { describe, expect, it } from "vitest";

import { defaultIo } from "../io.js";
import type { DeckImageCard } from "./deck-image.js";
import { formatLabelFromSlug, renderDeckImage } from "./deck-image.js";

// Exercises the real pipeline (font load + glyph rasterize + QR + satori +
// sharp). No DB or media: a null imageId falls back to a name-only tile, which
// still renders, and the rune glyphs ship as bundled assets.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

  it("renders without the owner chip when no owner name is given (logged-out local deck)", async () => {
    const png = await renderDeckImage(defaultIo, {
      ...baseInput,
      ownerName: undefined,
      cards: constructedDeck,
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });
});

describe("formatLabelFromSlug", () => {
  it("capitalizes and de-hyphenates a format slug", () => {
    expect(formatLabelFromSlug("constructed")).toBe("Constructed");
    expect(formatLabelFromSlug("custom-region")).toBe("Custom region");
  });
});
