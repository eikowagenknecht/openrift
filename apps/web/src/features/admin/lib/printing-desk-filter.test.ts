import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { describe, expect, it } from "vitest";

import {
  filterDeskPrintings,
  matchesDeskFilter,
  imageCountText,
  sortDeskPrintings,
} from "./printing-desk-filter";

function row(overrides: Partial<DeskPrintingRow> = {}): DeskPrintingRow {
  return {
    printingId: "p-1",
    cardId: "c-1",
    cardSlug: "annie-dark-child",
    cardName: "Annie, Dark Child",
    cardType: "Champion Unit",
    setId: "s-1",
    setName: "Origins",
    setSlug: "origins",
    shortCode: "OGN-101",
    publicCode: "OGN-101",
    rarity: "epic",
    finish: "foil",
    language: "en",
    size: "standard",
    artist: "Kudos Productions",
    markerSlugs: [],
    distributionChannelSlugs: [],
    announcedAt: null,
    releasedAt: null,
    releasePrecision: null,
    comment: null,
    imageCount: 0,
    activeImageFileId: null,
    activeImageUrl: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T11:00:00.000Z",
    createdByMe: true,
    ...overrides,
  };
}

const ANY = { query: "", status: "any" } as const;

describe("matchesDeskFilter", () => {
  it("keeps everything with an empty filter", () => {
    expect(matchesDeskFilter(row(), ANY)).toBe(true);
  });

  it("matches the card name case-insensitively", () => {
    expect(matchesDeskFilter(row(), { ...ANY, query: "annie" })).toBe(true);
    expect(matchesDeskFilter(row(), { ...ANY, query: "ANNIE" })).toBe(true);
    expect(matchesDeskFilter(row(), { ...ANY, query: "yasuo" })).toBe(false);
  });

  it("matches the card slug", () => {
    expect(matchesDeskFilter(row(), { ...ANY, query: "dark-child" })).toBe(true);
  });

  it("matches the code", () => {
    expect(matchesDeskFilter(row(), { ...ANY, query: "ogn-101" })).toBe(true);
  });

  it("finds an unannounced printing by the text the row shows", () => {
    expect(matchesDeskFilter(row({ publicCode: "TBA" }), { ...ANY, query: "code tba" })).toBe(true);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(matchesDeskFilter(row(), { ...ANY, query: "  annie  " })).toBe(true);
  });

  it("keeps only announced rows on the announced filter", () => {
    expect(matchesDeskFilter(row(), { query: "", status: "announced" })).toBe(true);
    expect(matchesDeskFilter(row(), { query: "", status: "released" })).toBe(false);
  });

  it("keeps only released rows on the released filter", () => {
    const released = row({ releasedAt: "2020-01-01", releasePrecision: "day" });

    expect(matchesDeskFilter(released, { query: "", status: "released" })).toBe(true);
    expect(matchesDeskFilter(released, { query: "", status: "announced" })).toBe(false);
  });

  it("applies the text and the status together", () => {
    const released = row({ releasedAt: "2020-01-01", releasePrecision: "day" });

    expect(matchesDeskFilter(released, { query: "yasuo", status: "released" })).toBe(false);
  });
});

describe("filterDeskPrintings", () => {
  it("keeps the input order", () => {
    const rows = [row({ printingId: "p-1" }), row({ printingId: "p-2" })];

    expect(filterDeskPrintings(rows, ANY).map((r) => r.printingId)).toEqual(["p-1", "p-2"]);
  });

  it("drops rows that do not match", () => {
    const rows = [row({ cardName: "Annie" }), row({ cardName: "Yasuo", cardSlug: "yasuo" })];

    expect(filterDeskPrintings(rows, { ...ANY, query: "yasuo" })).toHaveLength(1);
  });
});

describe("imageCountText", () => {
  it("reads no images at zero", () => {
    expect(imageCountText(0)).toBe("no images");
  });

  it("stays singular at one", () => {
    expect(imageCountText(1)).toBe("1 image");
  });

  it("is plural above one", () => {
    expect(imageCountText(4)).toBe("4 images");
  });
});

describe("sortDeskPrintings", () => {
  const rows = [
    row({
      printingId: "b",
      shortCode: "OGN-101",
      finish: "normal",
      cardName: "Zed",
      updatedAt: "2026-09-03T00:00:00.000Z",
      releasedAt: "2026-01-01",
      releasePrecision: "day",
    }),
    row({
      printingId: "a",
      shortCode: "OGN-009",
      cardName: "Annie",
      updatedAt: "2026-09-01T00:00:00.000Z",
      releasedAt: null,
    }),
    row({
      printingId: "c",
      shortCode: "OGN-101",
      finish: "foil",
      language: "en",
      cardName: "Zed",
      updatedAt: "2026-09-02T00:00:00.000Z",
      releasedAt: "2026-03-01",
      releasePrecision: "month",
    }),
    row({
      printingId: "d",
      shortCode: "OGN-101",
      finish: "normal",
      language: "de",
      cardName: "Zed",
      updatedAt: "2026-09-04T00:00:00.000Z",
      releasedAt: null,
    }),
  ];
  const ids = (sorted: readonly { printingId: string }[]) => sorted.map((r) => r.printingId);

  it("orders by code numerically, then language, then finish", () => {
    expect(ids(sortDeskPrintings(rows, "code"))).toEqual(["a", "d", "c", "b"]);
  });

  it("orders by card name with the code as tie-breaker", () => {
    expect(ids(sortDeskPrintings(rows, "card"))).toEqual(["a", "d", "c", "b"]);
  });

  it("puts the most recently updated first", () => {
    expect(ids(sortDeskPrintings(rows, "updated"))).toEqual(["d", "b", "c", "a"]);
  });

  it("puts the latest release first and undated rows last", () => {
    expect(ids(sortDeskPrintings(rows, "release"))).toEqual(["c", "b", "a", "d"]);
  });

  it("does not mutate the input", () => {
    const input = [...rows];
    sortDeskPrintings(input, "code");
    expect(input).toEqual(rows);
  });
});
