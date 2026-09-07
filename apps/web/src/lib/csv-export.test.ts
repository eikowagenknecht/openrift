import type { CopyResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { stubCopy } from "@/test/factories";

import type { CsvExportLabels } from "./csv-export";
import {
  csvExportFilename,
  generateExportCSV,
  generatePiltoverArchiveCSV,
  generateRiftCoreCSV,
  generateRiftManaCSV,
} from "./csv-export";
import { parseImportData } from "./import-parsers";

function makeStack(overrides: {
  shortCode?: string;
  name?: string;
  rarity?: string;
  type?: string;
  types?: string[];
  domains?: string[];
  finish?: string;
  artVariant?: string;
  markers?: { id: string; slug: string; label: string; description: string | null }[];
  language?: string;
  setSlug?: string;
  isSigned?: boolean;
  isOvernumbered?: boolean;
  copyCount?: number;
}): StackedEntry {
  const printing = {
    shortCode: overrides.shortCode ?? "OGN-001",
    setSlug: overrides.setSlug ?? "OGN",
    rarity: overrides.rarity ?? "common",
    finish: overrides.finish ?? "normal",
    artVariant: overrides.artVariant ?? "normal",
    isSigned: overrides.isSigned ?? false,
    isOvernumbered: overrides.isOvernumbered ?? false,
    markers: overrides.markers ?? [],
    distributionChannels: [],
    language: overrides.language ?? "EN",
    card: {
      name: overrides.name ?? "Test Card",
      type: overrides.type ?? "unit",
      types: overrides.types ?? [overrides.type ?? "unit"],
      domains: overrides.domains ?? ["Arcane"],
    },
  } as unknown as Printing;

  return {
    printingId: "fake-id",
    printing,
    copyIds: Array.from({ length: overrides.copyCount ?? 1 }, (_, index) => `copy-${index}`),
  };
}

const LABELS: CsvExportLabels = {
  sets: { OGN: "Origins", ARC: "Arcane Box Set" },
  rarities: {
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    epic: "Epic",
    showcase: "Showcase",
  },
  conditions: {
    mint: "Mint",
    "near-mint": "Near Mint",
    excellent: "Excellent",
    good: "Good",
    "light-played": "Light Played",
    played: "Played",
    poor: "Poor",
  },
  graders: { psa: "PSA", bgs: "BGS", cgc: "CGC", sgc: "SGC", tag: "TAG" },
};

describe("generateExportCSV", () => {
  it("includes the Promo and metadata columns in headers", () => {
    const csv = generateExportCSV([]);
    const headers = csv.split("\n")[0];
    expect(headers).toBe(
      "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Overnumbered,Promo,Language,Quantity," +
        "Condition,Grader,Grade,Altered,Public Notes,Private Notes,Links",
    );
  });

  it("exports promo slug when present", () => {
    const stack = makeStack({
      shortCode: "OGN-042",
      name: "Promo Card",
      markers: [{ id: "pt-1", slug: "nexus", label: "Nexus", description: null }],
      copyCount: 2,
    });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("OGN-042,Promo Card,common,unit,Arcane,normal,normal,,nexus,EN,2,,,,,,,");
  });

  it("exports empty promo field for non-promo cards", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("OGN-001,Regular Card,common,unit,Arcane,normal,normal,,,EN,1,,,,,,,");
  });

  it("writes Yes in the Overnumbered column beside the art variant", () => {
    const stack = makeStack({
      shortCode: "OGN-303a",
      name: "Loose Cannon",
      artVariant: "altart",
      isOvernumbered: true,
    });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe(
      "OGN-303a,Loose Cannon,common,unit,Arcane,normal,altart,Yes,,EN,1,,,,,,,",
    );
  });

  it("joins all types for a multi-type card, matching the Domain column's separator", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Unit Gear", types: ["unit", "gear"] });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe(
      "OGN-001,Unit Gear,common,unit / gear,Arcane,normal,normal,,,EN,1,,,,,,,",
    );
  });

  it("escapes fields with commas", () => {
    const stack = makeStack({ name: "Card, the Great" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Card, the Great"');
  });

  it("splits a stack into one row per metadata combination", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card", copyCount: 4 });
    stack.copyIds = ["c1", "c2", "c3", "c4"];
    const copiesById = new Map<string, CopyResponse>([
      ["c1", stubCopy({ id: "c1", condition: "near-mint" })],
      ["c2", stubCopy({ id: "c2", condition: "near-mint" })],
      ["c3", stubCopy({ id: "c3", condition: "played", isAltered: true })],
      ["c4", stubCopy({ id: "c4" })],
    ]);
    const csv = generateExportCSV([stack], copiesById);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      "OGN-001,Regular Card,common,unit,Arcane,normal,normal,,,EN,2,near-mint,,,,,,",
    );
    expect(lines[2]).toBe(
      "OGN-001,Regular Card,common,unit,Arcane,normal,normal,,,EN,1,played,,,Yes,,,",
    );
    expect(lines[3]).toBe("OGN-001,Regular Card,common,unit,Arcane,normal,normal,,,EN,1,,,,,,,");
  });

  it("exports grading, notes, and encoded links", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card", copyCount: 1 });
    stack.copyIds = ["c1"];
    const copiesById = new Map<string, CopyResponse>([
      [
        "c1",
        stubCopy({
          id: "c1",
          grader: "psa",
          grade: 9.5,
          notesPublic: "Pack fresh",
          notesPrivate: "From Worlds",
          links: [
            { url: "https://example.com/a.jpg", label: "Front" },
            { url: "https://example.com/b.jpg" },
          ],
        }),
      ],
    ]);
    const csv = generateExportCSV([stack], copiesById);
    const lines = csv.split("\n");
    expect(lines[1]).toBe(
      "OGN-001,Regular Card,common,unit,Arcane,normal,normal,,,EN,1,,psa,9.5,,Pack fresh,From Worlds," +
        "https://example.com/a.jpg|Front; https://example.com/b.jpg",
    );
  });

  it("round-trips metadata through the OpenRift importer", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card", copyCount: 2 });
    stack.copyIds = ["c1", "c2"];
    const copiesById = new Map<string, CopyResponse>([
      ["c1", stubCopy({ id: "c1", condition: "light-played", notesPublic: "worn edge" })],
      [
        "c2",
        stubCopy({
          id: "c2",
          grader: "bgs",
          grade: 8.5,
          links: [{ url: "https://example.com/slab.jpg" }],
        }),
      ],
    ]);
    const csv = generateExportCSV([stack], copiesById);
    const result = parseImportData(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].metadata).toEqual({
      condition: "light-played",
      notesPublic: "worn edge",
    });
    expect(result.entries[1].metadata).toEqual({
      grader: "bgs",
      grade: 8.5,
      links: [{ url: "https://example.com/slab.jpg" }],
    });
  });

  it("emits straight apostrophes for card names with curly ones", () => {
    const stack = makeStack({ shortCode: "OGN-269", name: "Kai’Sa, Survivor" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Kai'Sa, Survivor");
    expect(lines[1]).not.toContain("’");
  });
});

describe("generatePiltoverArchiveCSV", () => {
  it("emits Piltover Archive's own header row", () => {
    const csv = generatePiltoverArchiveCSV([], LABELS);
    expect(csv.split("\n")[0]).toBe(
      "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Foil,Quantity," +
        "Language,Condition,Grading Company,Grading Value,Grading Label,Notes",
    );
  });

  it("writes the short code as the variant number, with the set and rarity named", () => {
    const stack = makeStack({ shortCode: "OGN-090", name: "Orb of Regret", copyCount: 4 });
    const lines = generatePiltoverArchiveCSV([stack], LABELS).split("\n");
    expect(lines[1]).toBe(
      "OGN-090,Orb of Regret,Origins,OGN,Common,Standard,Standard,false,4,English,,,,,",
    );
  });

  it("carries finish in the Foil column instead of a variant-number suffix", () => {
    const common = makeStack({ shortCode: "OGN-004", finish: "foil", rarity: "common" });
    const alwaysFoil = makeStack({ shortCode: "OGN-025", finish: "foil", rarity: "rare" });
    const [, commonRow] = generatePiltoverArchiveCSV([common], LABELS).split("\n");
    const [, alwaysFoilRow] = generatePiltoverArchiveCSV([alwaysFoil], LABELS).split("\n");
    expect(commonRow.split(",")[0]).toBe("OGN-004");
    expect(commonRow.split(",")[7]).toBe("true");
    expect(alwaysFoilRow.split(",")[7]).toBe("true");
  });

  it("counts metal and metal-deluxe as foil, which is all their format has", () => {
    const stack = makeStack({ shortCode: "OGN-309", finish: "metal-deluxe", rarity: "showcase" });
    const lines = generatePiltoverArchiveCSV([stack], LABELS).split("\n");
    expect(lines[1].split(",")[7]).toBe("true");
  });

  it("types overnumbered ahead of a promo marker, and a promo marker ahead of alt art", () => {
    const promoMarker = { id: "m1", slug: "promo", label: "Promo", description: null };
    const overnumbered = makeStack({
      shortCode: "OGN-309",
      isOvernumbered: true,
      markers: [promoMarker],
    });
    const promoAltArt = makeStack({
      shortCode: "OGN-089b",
      artVariant: "altart",
      markers: [promoMarker],
    });
    const altArt = makeStack({ shortCode: "OGN-089a", artVariant: "altart" });
    const typeOf = (stack: StackedEntry) =>
      generatePiltoverArchiveCSV([stack], LABELS).split("\n")[1].split(",")[5];
    expect(typeOf(overnumbered)).toBe("Overnumbered");
    expect(typeOf(promoAltArt)).toBe("Promo");
    expect(typeOf(altArt)).toBe("Alt Art");
  });

  it("marks a signed printing in the variant label, as their export does", () => {
    const stack = makeStack({
      shortCode: "OGN-309*",
      isOvernumbered: true,
      isSigned: true,
    });
    const cells = generatePiltoverArchiveCSV([stack], LABELS).split("\n")[1].split(",");
    expect(cells[0]).toBe("OGN-309*");
    expect(cells[6]).toBe("Overnumbered Signed");
  });

  it("names the condition in full and leaves it blank when unrecorded", () => {
    const stack = makeStack({ shortCode: "OGN-001", copyCount: 2 });
    stack.copyIds = ["c1", "c2"];
    const copiesById = new Map<string, CopyResponse>([
      ["c1", stubCopy({ id: "c1", condition: "light-played" })],
      ["c2", stubCopy({ id: "c2" })],
    ]);
    const lines = generatePiltoverArchiveCSV([stack], LABELS, copiesById).split("\n");
    expect(lines[1].split(",")[10]).toBe("Light Played");
    expect(lines[2].split(",")[10]).toBe("");
  });

  it("gives a graded copy its own row with the grading columns filled", () => {
    const stack = makeStack({ shortCode: "OGN-001", copyCount: 3 });
    stack.copyIds = ["c1", "c2", "c3"];
    const copiesById = new Map<string, CopyResponse>([
      ["c1", stubCopy({ id: "c1", grader: "psa", grade: 9, notesPublic: "lolli" })],
      ["c2", stubCopy({ id: "c2", condition: "near-mint" })],
      ["c3", stubCopy({ id: "c3", condition: "near-mint" })],
    ]);
    const lines = generatePiltoverArchiveCSV([stack], LABELS, copiesById).split("\n");
    expect(lines).toHaveLength(3);
    const graded = lines[1].split(",");
    expect(graded[8]).toBe("1");
    expect(graded[10]).toBe("");
    expect(graded[11]).toBe("PSA");
    expect(graded[12]).toBe("9");
    expect(graded[13]).toBe("");
    expect(graded[14]).toBe("lolli");
    expect(lines[2].split(",")[8]).toBe("2");
  });

  it("round-trips through the Piltover Archive import parser", () => {
    const stacks = [
      makeStack({ shortCode: "OGN-090", name: "Plain", copyCount: 2 }),
      makeStack({ shortCode: "OGN-004", name: "Foil common", finish: "foil", rarity: "common" }),
      makeStack({ shortCode: "OGN-089a", name: "Alt", artVariant: "altart", finish: "foil" }),
      makeStack({
        shortCode: "OGN-309*",
        name: "Signed",
        isOvernumbered: true,
        isSigned: true,
        finish: "foil",
      }),
      makeStack({
        shortCode: "OGN-089b",
        name: "Promo",
        artVariant: "altart",
        finish: "foil",
        markers: [{ id: "m1", slug: "promo", label: "Promo", description: null }],
      }),
    ];
    const result = parseImportData(generatePiltoverArchiveCSV(stacks, LABELS));

    expect(result.source).toBe("piltover-archive");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(5);

    const byCode = new Map(result.entries.map((entry) => [entry.sourceCode, entry]));
    expect(byCode.get("OGN-090")).toMatchObject({
      finish: "normal",
      artVariant: "normal",
      quantity: 2,
      language: "EN",
    });
    expect(byCode.get("OGN-004")).toMatchObject({ finish: "foil" });
    expect(byCode.get("OGN-089a")).toMatchObject({ finish: "foil", artVariant: "altart" });
    expect(byCode.get("OGN-309*")).toMatchObject({ isOvernumbered: true });
    expect(byCode.get("OGN-089b")).toMatchObject({ isPromo: true });
  });

  it("round-trips a graded copy's grading and notes", () => {
    const stack = makeStack({ shortCode: "OGN-001", copyCount: 1 });
    stack.copyIds = ["c1"];
    const copiesById = new Map<string, CopyResponse>([
      ["c1", stubCopy({ id: "c1", grader: "psa", grade: 9, notesPublic: "lolli" })],
    ]);
    const result = parseImportData(generatePiltoverArchiveCSV([stack], LABELS, copiesById));
    expect(result.entries[0].metadata).toEqual({
      grader: "psa",
      grade: 9,
      notesPublic: "lolli",
    });
  });
});

describe("generateRiftManaCSV", () => {
  it("emits the RiftMana header row", () => {
    expect(generateRiftManaCSV([], LABELS).split("\n")[0]).toBe(
      "Normal Qty,Foil Qty,Card Name,Card ID,Set,Color,Rarity,Normal Price,Foil Price," +
        "Normal Condition,Foil Condition,Notes,Language",
    );
  });

  it("merges normal and foil printings of a card into one row", () => {
    const lines = generateRiftManaCSV(
      [
        makeStack({ shortCode: "OGN-001", copyCount: 2 }),
        makeStack({ shortCode: "OGN-001", finish: "foil" }),
      ],
      LABELS,
    ).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("2,1,Test Card,OGN-001,Origins,Arcane,Common,,,,,,English");
  });

  it("counts always-foil rarities in the Normal Qty column", () => {
    const lines = generateRiftManaCSV(
      [makeStack({ shortCode: "OGN-025", finish: "foil", rarity: "rare" })],
      LABELS,
    ).split("\n");
    expect(lines[1].split(",").slice(0, 2)).toEqual(["1", "0"]);
  });

  it("appends the -p suffix for promo printings", () => {
    const lines = generateRiftManaCSV(
      [
        makeStack({
          shortCode: "OGN-010",
          markers: [{ id: "m1", slug: "nexus", label: "Nexus", description: null }],
        }),
      ],
      LABELS,
    ).split("\n");
    expect(lines[1].split(",")[3]).toBe("OGN-010-p");
  });

  it("keeps languages as separate rows and writes their full names", () => {
    const lines = generateRiftManaCSV(
      [
        makeStack({ shortCode: "OGN-001", language: "EN" }),
        makeStack({ shortCode: "OGN-001", language: "SC" }),
      ],
      LABELS,
    ).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("English");
    expect(lines[2]).toContain("Chinese (Simplified)");
  });

  it("encodes recorded conditions per finish column", () => {
    const stack = makeStack({ shortCode: "OGN-001", copyCount: 3 });
    stack.copyIds = ["c1", "c2", "c3"];
    const copiesById = new Map<string, CopyResponse>([
      ["c1", stubCopy({ id: "c1", condition: "near-mint" })],
      ["c2", stubCopy({ id: "c2", condition: "light-played" })],
      ["c3", stubCopy({ id: "c3" })],
    ]);
    const lines = generateRiftManaCSV([stack], LABELS, copiesById).split("\n");
    expect(lines[1].split(",")[9]).toBe("NM:1;LP:1");
  });

  it("round-trips through the RiftMana import parser, which has no overnumbered column", () => {
    const stacks = [
      makeStack({ shortCode: "OGN-001", name: "Plain", copyCount: 2 }),
      makeStack({ shortCode: "OGN-001", name: "Plain", finish: "foil" }),
      makeStack({ shortCode: "OGN-025", name: "Always foil", finish: "foil", rarity: "rare" }),
      makeStack({ shortCode: "OGN-079a", name: "Alt", artVariant: "altart" }),
      makeStack({ shortCode: "OGN-123*", name: "Over", isOvernumbered: true }),
      makeStack({
        shortCode: "OGN-010",
        name: "Promo",
        language: "SC",
        markers: [{ id: "m1", slug: "nexus", label: "Nexus", description: null }],
      }),
    ];
    const result = parseImportData(generateRiftManaCSV(stacks, LABELS));

    expect(result.source).toBe("riftmana");
    expect(result.errors).toEqual([]);

    const byKey = new Map(
      result.entries.map((entry) => [`${entry.sourceCode}:${entry.finish}`, entry]),
    );
    expect(byKey.get("OGN-001:normal")).toMatchObject({ quantity: 2, artVariant: "normal" });
    expect(byKey.get("OGN-001:foil")).toMatchObject({ quantity: 1 });
    expect(byKey.get("OGN-025:foil")).toMatchObject({ quantity: 1 });
    expect(byKey.get("OGN-079a:normal")).toMatchObject({ artVariant: "altart" });
    expect(byKey.get("OGN-123*:normal")?.isOvernumbered).toBeUndefined();
    expect(byKey.get("OGN-010:normal")).toMatchObject({ isPromo: true, language: "SC" });
  });

  it("round-trips conditions as split entries", () => {
    const stack = makeStack({ shortCode: "OGN-001", copyCount: 3 });
    stack.copyIds = ["c1", "c2", "c3"];
    const copiesById = new Map<string, CopyResponse>([
      ["c1", stubCopy({ id: "c1", condition: "near-mint" })],
      ["c2", stubCopy({ id: "c2", condition: "near-mint" })],
      ["c3", stubCopy({ id: "c3", condition: "played" })],
    ]);
    const result = parseImportData(generateRiftManaCSV([stack], LABELS, copiesById));
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      quantity: 2,
      metadata: { condition: "near-mint" },
    });
    expect(result.entries[1]).toMatchObject({ quantity: 1, metadata: { condition: "played" } });
  });
});

describe("generateRiftCoreCSV", () => {
  it("leads with the RIFTCORE marker line, then the header row", () => {
    const lines = generateRiftCoreCSV([], LABELS).split("\n");
    expect(lines[0]).toBe("RIFTCORE COLLECTION EXPORT");
    expect(lines[1]).toBe(
      "Card ID,Card Name,Set,Card Number,Type,Rarity,Domain,Standard Qty,Foil Qty," +
        "Proving Grounds Qty,Total Qty",
    );
  });

  it("merges normal and foil printings of a card into one row with totals", () => {
    const lines = generateRiftCoreCSV(
      [
        makeStack({ shortCode: "OGN-001", copyCount: 2 }),
        makeStack({ shortCode: "OGN-001", finish: "foil" }),
      ],
      LABELS,
    ).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("OGN-001,Test Card,Origins,001,unit,Common,Arcane,2,1,0,3");
  });

  it("writes RiftCore's Card ID spelling: uppercase modifier and S for *", () => {
    const lines = generateRiftCoreCSV(
      [
        makeStack({ shortCode: "OGN-030a", artVariant: "altart" }),
        makeStack({ shortCode: "OGN-123*", isOvernumbered: true }),
      ],
      LABELS,
    ).split("\n");
    expect(lines[2].split(",")[0]).toBe("OGN-030A");
    expect(lines[3].split(",")[0]).toBe("OGN-123S");
  });

  it("counts always-foil rarities in the Standard Qty column", () => {
    const lines = generateRiftCoreCSV(
      [makeStack({ shortCode: "OGN-025", finish: "foil", rarity: "rare" })],
      LABELS,
    ).split("\n");
    expect(lines[2].split(",").slice(7, 11)).toEqual(["1", "0", "0", "1"]);
  });

  it("round-trips through the RiftCore import parser, which has no overnumbered column", () => {
    const stacks = [
      makeStack({ shortCode: "OGN-001", name: "Plain", copyCount: 2 }),
      makeStack({ shortCode: "OGN-001", name: "Plain", finish: "foil" }),
      makeStack({ shortCode: "OGN-025", name: "Always foil", finish: "foil", rarity: "rare" }),
      makeStack({ shortCode: "OGN-030a", name: "Alt", artVariant: "altart" }),
      makeStack({ shortCode: "OGN-123*", name: "Over", isOvernumbered: true }),
    ];
    const result = parseImportData(generateRiftCoreCSV(stacks, LABELS));

    expect(result.source).toBe("riftcore");
    expect(result.errors).toEqual([]);

    const byKey = new Map(
      result.entries.map((entry) => [`${entry.sourceCode}:${entry.finish}`, entry]),
    );
    expect(byKey.get("OGN-001:normal")).toMatchObject({ quantity: 2 });
    expect(byKey.get("OGN-001:foil")).toMatchObject({ quantity: 1 });
    expect(byKey.get("OGN-025:foil")).toMatchObject({ quantity: 1 });
    expect(byKey.get("OGN-030a:normal")).toMatchObject({ artVariant: "altart" });
    expect(byKey.get("OGN-123*:normal")?.isOvernumbered).toBeUndefined();
  });
});

describe("csvExportFilename", () => {
  it("kebab-cases the name and adds the format prefix and date", () => {
    expect(csvExportFilename("riftmana", "My Trade Binder!")).toMatch(
      /^riftmana-my-trade-binder-\d{4}-\d{2}-\d{2}\.csv$/u,
    );
  });

  it("falls back to 'export' when the name has no usable characters", () => {
    expect(csvExportFilename("openrift", "☆☆☆")).toMatch(
      /^openrift-export-\d{4}-\d{2}-\d{2}\.csv$/u,
    );
  });
});
