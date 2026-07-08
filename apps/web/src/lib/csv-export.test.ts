import type { CopyResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { stubCopy } from "@/test/factories";

import { generateExportCSV, generatePiltoverArchiveCSV } from "./csv-export";
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
  copyCount?: number;
}): StackedEntry {
  const printing = {
    shortCode: overrides.shortCode ?? "OGN-001",
    setSlug: overrides.setSlug ?? "origins",
    rarity: overrides.rarity ?? "common",
    finish: overrides.finish ?? "normal",
    artVariant: overrides.artVariant ?? "normal",
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

describe("generateExportCSV", () => {
  it("includes the Promo and metadata columns in headers", () => {
    const csv = generateExportCSV([]);
    const headers = csv.split("\n")[0];
    expect(headers).toBe(
      "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Promo,Language,Quantity," +
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
    expect(lines[1]).toBe("OGN-042,Promo Card,common,unit,Arcane,normal,normal,nexus,EN,2,,,,,,,");
  });

  it("exports empty promo field for non-promo cards", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("OGN-001,Regular Card,common,unit,Arcane,normal,normal,,EN,1,,,,,,,");
  });

  // ADR-037: the Type column joins every type of a multi-type card, matching
  // the sibling Domain column's separator, instead of emitting only the primary.
  it("joins all types for a multi-type card", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Unit Gear", types: ["unit", "gear"] });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("OGN-001,Unit Gear,common,unit / gear,Arcane,normal,normal,,EN,1,,,,,,,");
  });

  it("escapes fields with commas", () => {
    const stack = makeStack({ name: "Card, the Great" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Card, the Great"');
  });

  it("splits a stack into one row per metadata combination (ADR-038)", () => {
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
      "OGN-001,Regular Card,common,unit,Arcane,normal,normal,,EN,2,near-mint,,,,,,",
    );
    expect(lines[2]).toBe(
      "OGN-001,Regular Card,common,unit,Arcane,normal,normal,,EN,1,played,,,Yes,,,",
    );
    expect(lines[3]).toBe("OGN-001,Regular Card,common,unit,Arcane,normal,normal,,EN,1,,,,,,,");
  });

  it("exports grading, notes, and encoded links (ADR-038)", () => {
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
      "OGN-001,Regular Card,common,unit,Arcane,normal,normal,,EN,1,,psa,9.5,,Pack fresh,From Worlds," +
        "https://example.com/a.jpg|Front; https://example.com/b.jpg",
    );
  });

  it("round-trips metadata through the OpenRift importer (ADR-038)", () => {
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
  it("splits a stack into one row per condition with NM fallback (ADR-038)", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card", copyCount: 3 });
    stack.copyIds = ["c1", "c2", "c3"];
    const copiesById = new Map<string, CopyResponse>([
      ["c1", stubCopy({ id: "c1", condition: "light-played" })],
      ["c2", stubCopy({ id: "c2", grader: "psa", grade: 10 })],
      ["c3", stubCopy({ id: "c3" })],
    ]);
    const csv = generatePiltoverArchiveCSV([stack], copiesById);
    const lines = csv.split("\n");
    // Graded and unrecorded copies pool under the NM fallback.
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("OGN-001,Regular Card,Origins,OGN,Common,Standard,,1,EN,LP");
    expect(lines[2]).toBe("OGN-001,Regular Card,Origins,OGN,Common,Standard,,2,EN,NM");
  });

  it("emits the Piltover Archive header row", () => {
    const csv = generatePiltoverArchiveCSV([]);
    expect(csv.split("\n")[0]).toBe(
      "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Quantity,Language,Condition",
    );
  });

  it("maps a plain printing to its base variant number", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card", copyCount: 3 });
    const lines = generatePiltoverArchiveCSV([stack]).split("\n");
    expect(lines[1]).toBe("OGN-001,Regular Card,Origins,OGN,Common,Standard,,3,EN,NM");
  });

  it("encodes a foil common with a -Foil suffix and Foil label", () => {
    const stack = makeStack({ shortCode: "OGN-004", finish: "foil", rarity: "common" });
    const lines = generatePiltoverArchiveCSV([stack]).split("\n");
    expect(lines[1]).toBe("OGN-004-Foil,Test Card,Origins,OGN,Common,Standard,Foil,1,EN,NM");
  });

  it("omits the -Foil suffix when the rarity is always foil", () => {
    const stack = makeStack({ shortCode: "OGN-025", finish: "foil", rarity: "rare" });
    const lines = generatePiltoverArchiveCSV([stack]).split("\n");
    expect(lines[1]).toBe("OGN-025,Test Card,Origins,OGN,Rare,Standard,,1,EN,NM");
  });

  it("encodes alt art via the short code modifier and Variant Type", () => {
    const stack = makeStack({ shortCode: "OGN-079a", artVariant: "altart" });
    const lines = generatePiltoverArchiveCSV([stack]).split("\n");
    expect(lines[1]).toBe("OGN-079a,Test Card,Origins,OGN,Common,Alt Art,,1,EN,NM");
  });

  it("appends a letters-only promo suffix from the marker label", () => {
    const stack = makeStack({
      shortCode: "OGN-001",
      markers: [{ id: "m1", slug: "nexus-night", label: "Nexus Night", description: null }],
    });
    const lines = generatePiltoverArchiveCSV([stack]).split("\n");
    expect(lines[1]).toBe(
      "OGN-001-NexusNight,Test Card,Origins,OGN,Common,Standard,Nexus Night,1,EN,NM",
    );
  });

  it("orders the promo suffix before the foil suffix", () => {
    const stack = makeStack({
      shortCode: "OGN-001",
      finish: "foil",
      markers: [{ id: "m1", slug: "nexus", label: "Nexus", description: null }],
    });
    const lines = generatePiltoverArchiveCSV([stack]).split("\n");
    expect(lines[1].split(",")[0]).toBe("OGN-001-Nexus-Foil");
    expect(lines[1].split(",")[6]).toBe("Nexus Foil");
  });

  it("round-trips through the Piltover Archive import parser", () => {
    const stacks = [
      makeStack({ shortCode: "OGN-001", name: "Plain", copyCount: 2 }),
      makeStack({ shortCode: "OGN-004", name: "Foil common", finish: "foil", rarity: "common" }),
      makeStack({ shortCode: "OGN-025", name: "Always foil", finish: "foil", rarity: "rare" }),
      makeStack({ shortCode: "OGN-079a", name: "Alt", artVariant: "altart" }),
      makeStack({ shortCode: "OGN-123*", name: "Over", artVariant: "overnumbered" }),
      makeStack({
        shortCode: "OGN-010",
        name: "Promo",
        language: "ZH",
        markers: [{ id: "m1", slug: "nexus", label: "Nexus", description: null }],
      }),
    ];
    const result = parseImportData(generatePiltoverArchiveCSV(stacks));

    expect(result.source).toBe("piltover-archive");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(6);

    const byCode = new Map(result.entries.map((entry) => [entry.sourceCode, entry]));
    expect(byCode.get("OGN-001")).toMatchObject({
      finish: "normal",
      artVariant: "normal",
      quantity: 2,
    });
    expect(byCode.get("OGN-004")).toMatchObject({ finish: "foil" });
    // Always-foil rarity has no -Foil suffix, but the importer still infers foil.
    expect(byCode.get("OGN-025")).toMatchObject({ finish: "foil" });
    expect(byCode.get("OGN-079a")).toMatchObject({ artVariant: "altart" });
    expect(byCode.get("OGN-123*")).toMatchObject({ artVariant: "overnumbered" });
    expect(byCode.get("OGN-010")).toMatchObject({ isPromo: true, language: "ZH" });
  });
});
