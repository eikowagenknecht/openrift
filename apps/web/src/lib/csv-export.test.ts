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
  promoType?: { id: string; slug: string; label: string } | null;
  copyCount?: number;
}): StackedEntry {
  const printing = {
    shortCode: overrides.shortCode ?? "OGN-001",
    rarity: overrides.rarity ?? "Common",
    finish: overrides.finish ?? "normal",
    artVariant: overrides.artVariant ?? "normal",
    promoType: overrides.promoType ?? null,
    card: {
      name: overrides.name ?? "Test Card",
      type: overrides.type ?? "Unit",
      domains: overrides.domains ?? ["Arcane"],
    },
  } as Printing;

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
    expect(headers).toBe("Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Promo,Quantity");
  });

  it("exports promo slug when present", () => {
    const stack = makeStack({
      shortCode: "OGN-042",
      name: "Promo Card",
      promoType: { id: "pt-1", slug: "nexus", label: "Nexus" },
      copyCount: 2,
    });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("OGN-042,Promo Card,Common,Unit,Arcane,normal,normal,nexus,2");
  });

  it("exports empty promo field for non-promo cards", () => {
    const stack = makeStack({ shortCode: "OGN-001", name: "Regular Card" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("OGN-001,Regular Card,Common,Unit,Arcane,normal,normal,,1");
  });

  it("escapes fields with commas", () => {
    const stack = makeStack({ name: "Card, the Great" });
    const csv = generateExportCSV([stack]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Card, the Great"');
  });
});
