import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { describe, expect, it } from "vitest";

import { buildPrintingDeskCsv, printingDeskCardUrl } from "./printing-desk-csv";

function row(overrides: Partial<DeskPrintingRow> = {}): DeskPrintingRow {
  return {
    printingId: "p-1",
    slug: "en-ogn-101-foil-standard",
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
    markerSlugs: ["prerelease", "stamped"],
    distributionChannelSlugs: ["nexus-night-2026-10"],
    announcedAt: "2026-07-15",
    releasedAt: "2026-08-01",
    releasePrecision: "month",
    comment: null,
    imageCount: 2,
    activeImageFileId: "img-1",
    activeImageUrl: "https://openrift.app/media/img-1.webp",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T11:00:00.000Z",
    canEdit: true,
    ...overrides,
  };
}

const channelPaths = new Map([["nexus-night-2026-10", "Nexus Night › October 2026"]]);

/** Quote-aware enough to index a single generated data row by column. */
function parseFirstDataRow(csv: string): string[] {
  const body = csv.slice(csv.indexOf("\n") + 1);
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i] ?? "";
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

describe("buildPrintingDeskCsv", () => {
  it("writes the header row even with no printings", () => {
    const csv = buildPrintingDeskCsv([], { channelPaths });

    expect(csv.split("\n")).toHaveLength(1);
    expect(csv).toContain("Card,Card slug,Code,Set");
    expect(csv).toContain("Created,Updated");
  });

  it("writes one row per printing", () => {
    const csv = buildPrintingDeskCsv([row(), row({ printingId: "p-2" })], { channelPaths });

    expect(csv.split("\n")).toHaveLength(3);
  });

  it("resolves the channel path from the slug", () => {
    const csv = buildPrintingDeskCsv([row()], { channelPaths });

    expect(parseFirstDataRow(csv)[9]).toBe("Nexus Night › October 2026");
  });

  it("falls back to the raw slug for a channel it cannot resolve", () => {
    const csv = buildPrintingDeskCsv([row({ distributionChannelSlugs: ["mystery-box"] })], {
      channelPaths,
    });

    expect(csv).toContain("mystery-box");
  });

  it("joins several markers and channels into one cell each", () => {
    const csv = buildPrintingDeskCsv(
      [row({ distributionChannelSlugs: ["nexus-night-2026-10", "mystery-box"] })],
      { channelPaths },
    );

    expect(csv).toContain("prerelease; stamped");
    expect(csv).toContain("Nexus Night › October 2026; mystery-box");
  });

  it("prefers the set label map over the row's set name", () => {
    const csv = buildPrintingDeskCsv([row()], {
      channelPaths,
      setLabels: new Map([["origins", "Origins (OGN)"]]),
    });

    expect(csv).toContain("Origins (OGN)");
  });

  it("renders an unannounced code as Code TBA", () => {
    const csv = buildPrintingDeskCsv([row({ publicCode: "TBA" })], { channelPaths });

    expect(csv).toContain("Code TBA");
  });

  it("writes TBA and an empty precision for a printing with no date", () => {
    const csv = buildPrintingDeskCsv([row({ releasedAt: null, releasePrecision: null })], {
      channelPaths,
    });
    const values = parseFirstDataRow(csv);

    expect(values[10]).toBe("announced");
    expect(values[12]).toBe("TBA");
    expect(values[13]).toBe("");
  });

  it("writes the announcement date, and an empty cell without one", () => {
    expect(parseFirstDataRow(buildPrintingDeskCsv([row()], { channelPaths }))[11]).toBe(
      "2026-07-15",
    );
    expect(
      parseFirstDataRow(buildPrintingDeskCsv([row({ announcedAt: null })], { channelPaths }))[11],
    ).toBe("");
  });

  it("leaves the note and the active image empty when they are unset", () => {
    const csv = buildPrintingDeskCsv([row({ comment: null, activeImageUrl: null })], {
      channelPaths,
    });
    const values = parseFirstDataRow(csv);

    expect(values[15]).toBe("");
    expect(values[17]).toBe("");
  });

  it("quotes a note that carries a comma, a quote or a newline", () => {
    const csv = buildPrintingDeskCsv([row({ comment: 'Signed, "in person"\nat the booth' })], {
      channelPaths,
    });

    expect(csv).toContain('"Signed, ""in person""\nat the booth"');
  });

  it("links the card page with the printing preselected", () => {
    const csv = buildPrintingDeskCsv([row()], {
      channelPaths,
      siteUrl: "https://openrift.app",
    });

    expect(csv).toContain("https://openrift.app/cards/annie-dark-child/en-ogn-101-foil-standard");
  });
});

describe("printingDeskCardUrl", () => {
  it("is site-relative without a site URL", () => {
    expect(
      printingDeskCardUrl({
        cardSlug: "annie-dark-child",
        slug: "en-ogn-101-foil-promo-standard",
      }),
    ).toBe("/cards/annie-dark-child/en-ogn-101-foil-promo-standard");
  });
});
