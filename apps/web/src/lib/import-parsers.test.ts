import { describe, expect, it } from "vitest";

import { parseImportData } from "./import-parsers";

describe("parseImportData — OpenRift format", () => {
  const header = "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Promo,Quantity";

  it("detects OpenRift format by Art Variant header", () => {
    const csv = `${header}\nOGN-001,Test Card,Common,Unit,Arcane,normal,normal,,1`;
    const result = parseImportData(csv);
    expect(result.source).toBe("openrift");
    expect(result.errors).toHaveLength(0);
  });

  it("parses a basic row", () => {
    const csv = `${header}\nOGN-042,Fire Bolt,Rare,Spell,Arcane,foil,normal,,3`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);

    const entry = result.entries[0];
    expect(entry.setPrefix).toBe("OGN");
    expect(entry.finish).toBe("foil");
    expect(entry.artVariant).toBe("normal");
    expect(entry.quantity).toBe(3);
    expect(entry.cardName).toBe("Fire Bolt");
    expect(entry.sourceCode).toBe("OGN-042");
    expect(entry.promoSlug).toBeUndefined();
  });

  it("parses promo slug", () => {
    const csv = `${header}\nOGN-001,Hero,Common,Unit,Arcane,foil,normal,nexus,1`;
    const result = parseImportData(csv);
    expect(result.entries[0].promoSlug).toBe("nexus");
  });

  it("handles alt art variant", () => {
    const csv = `${header}\nOGN-079a,Dragon,Epic,Legend,Arcane,foil,altart,,1`;
    const result = parseImportData(csv);
    const entry = result.entries[0];
    expect(entry.artVariant).toBe("altart");
    expect(entry.sourceCode).toBe("OGN-079a");
  });

  it("handles overnumbered variant", () => {
    const csv = `${header}\nOGN-123*,Rare Beast,Showcase,Unit,Nature,foil,overnumbered,,2`;
    const result = parseImportData(csv);
    const entry = result.entries[0];
    expect(entry.artVariant).toBe("overnumbered");
    expect(entry.sourceCode).toBe("OGN-123*");
  });

  it("handles token short codes", () => {
    const csv = `${header}\nSFD-T01,Token Creature,Common,Unit,Arcane,normal,normal,,1`;
    const result = parseImportData(csv);
    const entry = result.entries[0];
    expect(entry.setPrefix).toBe("SFD");
  });

  it("skips rows with zero quantity", () => {
    const csv = `${header}\nOGN-001,Card A,Common,Unit,Arcane,normal,normal,,0\nOGN-002,Card B,Common,Unit,Arcane,normal,normal,,1`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].cardName).toBe("Card B");
  });

  it("reports errors for unparseable card IDs", () => {
    const csv = `${header}\nBADID,Card X,Common,Unit,Arcane,normal,normal,,1`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toContain('Could not parse Card ID: "BADID"');
  });

  it("handles older exports without Promo column", () => {
    const oldHeader = "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Quantity";
    const csv = `${oldHeader}\nOGN-001,Old Card,Common,Unit,Arcane,normal,normal,1`;
    const result = parseImportData(csv);
    expect(result.source).toBe("openrift");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].promoSlug).toBeUndefined();
    expect(result.entries[0].quantity).toBe(1);
  });

  it("parses multiple rows", () => {
    const csv = [
      header,
      "OGN-001,Card A,Common,Unit,Arcane,normal,normal,,2",
      "OGN-002,Card B,Rare,Spell,Nature,foil,normal,release,1",
      "OGN-003,Card C,Epic,Legend,Arcane,foil,altart,,3",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(3);
    expect(result.rowCount).toBe(3);
  });

  it("populates rawFields for display", () => {
    const csv = `${header}\nOGN-001,Test,Common,Unit,Arcane,normal,normal,nexus,1`;
    const result = parseImportData(csv);
    const raw = result.entries[0].rawFields;
    expect(raw["Source Code"]).toBe("OGN-001");
    expect(raw["Rarity"]).toBe("Common");
    expect(raw["Promo"]).toBe("nexus");
  });

  it("returns empty entries for missing required columns", () => {
    const csv = "Card ID,Card Name,Art Variant\nOGN-001,Test,normal";
    const result = parseImportData(csv);
    expect(result.source).toBe("openrift");
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toContain('Missing required column: "Quantity".');
  });
});

describe("parseImportData — format detection", () => {
  it("still detects Piltover Archive format", () => {
    const csv = "Variant Number,Card Name,Quantity\nOGN-001,Test,1";
    const result = parseImportData(csv);
    expect(result.source).toBe("piltover-archive");
  });

  it("still detects RiftCore format", () => {
    const csv =
      "RIFTCORE COLLECTION EXPORT\n\n\n\n\n\nCard ID,Card Name,Standard Qty,Foil Qty\nOGN-001,Test,1,0";
    const result = parseImportData(csv);
    expect(result.source).toBe("riftcore");
  });

  it("returns error for unrecognized format", () => {
    const csv = "Unknown,Headers,Here\nfoo,bar,baz";
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0]).toContain("OpenRift");
  });
});
