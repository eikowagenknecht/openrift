import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { StackedEntry } from "@/hooks/use-stacked-copies";

import { generateExportCSV } from "./csv-export";

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
  copyCount?: number;
}): StackedEntry {
  const printing = {
    shortCode: overrides.shortCode ?? "OGN-001",
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
