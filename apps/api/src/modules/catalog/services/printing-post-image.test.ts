import { describe, expect, it } from "vitest";

import { defaultIo } from "../../../io.js";
import type { PrintingPostImageInput } from "./printing-post-image.js";
import { renderPrintingPostImage } from "./printing-post-image.js";

// Exercises the real pipeline (font load + satori + resvg), no DB and no media:
// `imageFileId: null` falls back to the name-only tile.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const baseInput: PrintingPostImageInput = {
  cardName: "Summoner Skirmish Banner",
  publicCode: "OGN-P01/298",
  finishLabel: "Foil",
  channelLabel: "Organized Play › Summoner Skirmish",
  markerLabels: ["Prerelease"],
  artist: "A. Painter",
  imageCredit: "gamesnight",
  label: "released",
  imageFileId: null,
  orientation: "portrait",
};

describe("renderPrintingPostImage", () => {
  it("renders the square canvas", async () => {
    const png = await renderPrintingPostImage(defaultIo, baseInput, "square");
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it("renders the portrait canvas", async () => {
    const png = await renderPrintingPostImage(defaultIo, baseInput, "portrait");
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  });

  it("renders the story canvas", async () => {
    const png = await renderPrintingPostImage(defaultIo, baseInput, "story");
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it("renders the 2× variant from the same layout", async () => {
    const png = await renderPrintingPostImage(defaultIo, baseInput, "square", 2);
    const meta = await defaultIo.sharp(png).metadata();
    expect(meta.width).toBe(2160);
    expect(meta.height).toBe(2160);
  }, 30_000);

  it("renders a landscape image without throwing", async () => {
    const png = await renderPrintingPostImage(
      defaultIo,
      { ...baseInput, orientation: "landscape" },
      "square",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders a printing with no image at all", async () => {
    const png = await renderPrintingPostImage(
      defaultIo,
      { ...baseInput, imageFileId: null },
      "portrait",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders without an image credit", async () => {
    const png = await renderPrintingPostImage(
      defaultIo,
      { ...baseInput, imageCredit: null },
      "square",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders the host mark beside the credit line", async () => {
    const png = await renderPrintingPostImage(
      defaultIo,
      { ...baseInput, siteHost: "cards.example" },
      "square",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders without a channel or markers", async () => {
    const png = await renderPrintingPostImage(
      defaultIo,
      { ...baseInput, channelLabel: null, markerLabels: [] },
      "square",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders the date beside the label pill", async () => {
    const png = await renderPrintingPostImage(
      defaultIo,
      { ...baseInput, dateText: "4 October 2026" },
      "square",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders a date with no markers to sit next to", async () => {
    const png = await renderPrintingPostImage(
      defaultIo,
      { ...baseInput, dateText: "Q2 2026", markerLabels: [] },
      "square",
    );
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders every label variant", async () => {
    for (const label of ["announced", "released", "collected"] as const) {
      const png = await renderPrintingPostImage(defaultIo, { ...baseInput, label }, "square");
      expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    }
  }, 30_000);
});
