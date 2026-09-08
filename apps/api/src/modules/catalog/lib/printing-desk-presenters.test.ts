import { describe, expect, it } from "vitest";

import type { DeskImageRow, DeskPrintingRow } from "../repositories/printing-desk.js";
import { toDeskImages, toDeskPrintingRow } from "./printing-desk-presenters.js";

const row: DeskPrintingRow = {
  printingId: "p1",
  slug: "en-tba-summoner-skirmish-banner-foil-prerelease-standard",
  cardId: "c1",
  cardSlug: "summoner-skirmish-banner",
  cardName: "Summoner Skirmish Banner",
  cardType: "battlefield",
  setId: "s1",
  setName: "Origins",
  setSlug: "ogn",
  shortCode: "TBA-summoner-skirmish-banner",
  publicCode: "TBA",
  rarity: "rare",
  finish: "foil",
  language: "EN",
  size: "standard",
  artist: "A. Painter",
  markerSlugs: ["prerelease"],
  distributionChannelSlugs: ["skirmish-2026"],
  announcedAt: "2026-02-14",
  releasedAt: "2026-04-01",
  releasePrecision: "month",
  comment: null,
  imageCount: 2,
  activeImageFileId: "img1",
  activeImageUrl: "/media/cards/g1/img1-full.webp",
  createdAt: new Date("2026-03-01T10:00:00.000Z"),
  updatedAt: new Date("2026-03-02T11:30:00.000Z"),
  isPromo: true,
};

const base: DeskPrintingRow = {
  ...row,
  markerSlugs: [],
  distributionChannelSlugs: [],
  isPromo: false,
};

describe("toDeskPrintingRow", () => {
  it("maps a row to the wire shape with ISO timestamps", () => {
    const result = toDeskPrintingRow(row, { createdByMe: true, isAdmin: false });
    expect(result).toEqual({
      ...row,
      isPromo: undefined,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-02T11:30:00.000Z",
      canEdit: true,
    });
  });

  it("lets any grant holder edit a promo", () => {
    expect(toDeskPrintingRow(row, { createdByMe: false, isAdmin: false }).canEdit).toBe(true);
  });

  it("lets a grant holder edit a non-promo they added", () => {
    expect(toDeskPrintingRow(base, { createdByMe: true, isAdmin: false }).canEdit).toBe(true);
  });

  it("keeps a non-promo someone else added out of a grant holder's reach", () => {
    expect(toDeskPrintingRow(base, { createdByMe: false, isAdmin: false }).canEdit).toBe(false);
  });

  it("lets the admin edit any printing", () => {
    expect(toDeskPrintingRow(base, { createdByMe: false, isAdmin: true }).canEdit).toBe(true);
  });

  it("carries the announcement date, null included", () => {
    const opts = { createdByMe: true, isAdmin: false };
    expect(toDeskPrintingRow(row, opts).announcedAt).toBe("2026-02-14");
    expect(toDeskPrintingRow({ ...row, announcedAt: null }, opts).announcedAt).toBeNull();
  });
});

describe("toDeskImages", () => {
  const image = (over: Partial<DeskImageRow>): DeskImageRow => ({
    printingImageId: "pi1",
    imageFileId: "img1",
    url: "https://cdn.example.test/img1.webp",
    isActive: true,
    rotation: 0,
    face: "front",
    credit: null,
    ...over,
  });

  it("maps rows to the wire shape", () => {
    expect(
      toDeskImages(
        [image({ rotation: 90, face: "back", isActive: false, credit: "gamesnight" })],
        new Set(["pi1"]),
      ),
    ).toEqual([
      {
        printingImageId: "pi1",
        imageFileId: "img1",
        url: "https://cdn.example.test/img1.webp",
        isActive: false,
        rotation: 90,
        face: "back",
        credit: "gamesnight",
        canDelete: true,
      },
    ]);
  });

  it("keeps an uncredited file's null credit", () => {
    expect(toDeskImages([image({})], new Set())[0]).toMatchObject({ credit: null });
  });

  it("marks an image the caller may not delete", () => {
    expect(toDeskImages([image({})], new Set(["other"]))[0]).toMatchObject({ canDelete: false });
  });

  it("drops a file with neither a rehosted nor an original URL", () => {
    expect(toDeskImages([image({ url: null }), image({ imageFileId: "img2" })], new Set())).toEqual(
      [expect.objectContaining({ imageFileId: "img2" })],
    );
  });
});
