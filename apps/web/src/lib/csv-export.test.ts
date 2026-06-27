import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { StackedEntry } from "@/hooks/use-stacked-copies";

import { generateExportCSV, generatePiltoverArchiveCSV } from "./csv-export";
import { parseImportData } from "./import-parsers";

function makeStack(overrides: {
  shortCode?: string;
  name?: string;
  rarity?: string;
  type?: string;
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
  it("includes the Promo column in headers", () => {
    const csv = generateExportCSV([]);
    const headers = csv.split("\n")[0];
    expect(headers).toBe(
      "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Promo,Language,Quantity",
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
    expect(lines[1]).toBe("OGN-042,Promo Card,common,unit,Arcane,normal,normal,nexus,EN,2");
  });

  it("exports empty promo field for non-promo cards", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("OGN-001,Regular Card,common,unit,Arcane,normal,normal,,EN,1");
  });

  it("escapes fields with commas", () => {
    const stack = makeStack({ name: "Card, the Great" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Card, the Great"');
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

  it("encodes foil with a -Foil suffix and Foil label", () => {
    const stack = makeStack({ shortCode: "OGN-004", finish: "foil", rarity: "rare" });
    const lines = generatePiltoverArchiveCSV([stack]).split("\n");
    expect(lines[1]).toBe("OGN-004-Foil,Test Card,Origins,OGN,Rare,Standard,Foil,1,EN,NM");
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
      makeStack({ shortCode: "OGN-004", name: "Foiled", finish: "foil", rarity: "rare" }),
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
    expect(result.entries).toHaveLength(5);

    const byCode = new Map(result.entries.map((entry) => [entry.sourceCode, entry]));
    expect(byCode.get("OGN-001")).toMatchObject({
      finish: "normal",
      artVariant: "normal",
      quantity: 2,
    });
    expect(byCode.get("OGN-004")).toMatchObject({ finish: "foil" });
    expect(byCode.get("OGN-079a")).toMatchObject({ artVariant: "altart" });
    expect(byCode.get("OGN-123*")).toMatchObject({ artVariant: "overnumbered" });
    expect(byCode.get("OGN-010")).toMatchObject({ isPromo: true, language: "ZH" });
  });
});
