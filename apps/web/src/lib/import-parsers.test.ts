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

  it("parses language column when present", () => {
    const headerWithLang =
      "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Promo,Language,Quantity";
    const csv = `${headerWithLang}\nOGN-001,Test Card,Common,Unit,Arcane,normal,normal,,ZH,1`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("ZH");
  });

  it("returns undefined language for older exports without Language column", () => {
    const csv = `${header}\nOGN-001,Test Card,Common,Unit,Arcane,normal,normal,,1`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBeUndefined();
  });
});

describe("parseImportData — RiftMana format", () => {
  const header =
    "Normal Qty,Foil Qty,Card Name,Card ID,Set,Color,Rarity,Normal Price,Foil Price,Normal Condition,Foil Condition,Notes,Language";

  it("detects RiftMana format by Normal Qty header", () => {
    const csv = `${header}\n1,0,Buff,OGN-XXX,Origins,,Common,0.21,0.00,NM:1,,,English`;
    const result = parseImportData(csv);
    expect(result.source).toBe("riftmana");
    expect(result.errors).toHaveLength(0);
  });

  it("parses normal quantity row", () => {
    const csv = `${header}\n1,0,Buff,OGN-XXX,Origins,,Common,0.21,0.00,NM:1,,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);

    const entry = result.entries[0];
    expect(entry.setPrefix).toBe("OGN");
    expect(entry.finish).toBe("normal");
    expect(entry.artVariant).toBe("normal");
    expect(entry.quantity).toBe(1);
    expect(entry.cardName).toBe("Buff");
    expect(entry.sourceCode).toBe("OGN-XXX");
    expect(entry.language).toBe("EN");
    expect(entry.isPromo).toBeUndefined();
  });

  it("splits normal and foil into separate entries", () => {
    const csv = `${header}\n1,2,Blazing Scorcher,OGN-001,Origins,Fury,Common,0.11,0.25,NM:1,NM:2,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(2);

    const normal = result.entries[0];
    expect(normal.finish).toBe("normal");
    expect(normal.quantity).toBe(1);

    const foil = result.entries[1];
    expect(foil.finish).toBe("foil");
    expect(foil.quantity).toBe(2);
  });

  it("parses foil-only row", () => {
    const csv = `${header}\n0,3,Get Excited!,OGN-008,Origins,Fury,Common,0.09,0.34,,NM:3,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);

    const entry = result.entries[0];
    expect(entry.finish).toBe("foil");
    expect(entry.quantity).toBe(3);
    expect(entry.cardName).toBe("Get Excited!");
  });

  it("handles alt art suffix", () => {
    const csv = `${header}\n0,1,Fury Rune,OGN-007a,Origins,Fury,Showcase,0.48,9.41,,NM:1,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].artVariant).toBe("altart");
    expect(result.entries[0].sourceCode).toBe("OGN-007a");
  });

  it("handles overnumbered suffix", () => {
    const csv = `${header}\n0,1,Jinx Loose Cannon,OGN-301*,Origins,Fury Chaos,Showcase,0.00,960.52,,NM:1,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].artVariant).toBe("overnumbered");
    expect(result.entries[0].sourceCode).toBe("OGN-301*");
  });

  it("strips lowercase -p promo suffix and sets isPromo", () => {
    const csv = `${header}\n0,8,Blazing Scorcher,OGN-001-p,Promotional Cards,Fury,Common,0.00,0.24,,NM:4;HP:3;SEAL:1,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sourceCode).toBe("OGN-001");
    expect(result.entries[0].setPrefix).toBe("OGN");
    expect(result.entries[0].isPromo).toBe(true);
  });

  it("strips uppercase -P promo suffix and sets isPromo", () => {
    const csv = `${header}\n0,2,Buff,OGN-XXX-P,Promotional Cards,,Common,0.00,125.33,,NM:2,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].isPromo).toBe(true);
    expect(result.entries[0].sourceCode).toBe("OGN-XXX");
  });

  it("treats rare/epic/showcase normal qty as foil", () => {
    const csv = `${header}\n1,0,Immortal Phoenix,OGN-037,Origins,Fury,Epic,0.00,27.99,NM:1,,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].finish).toBe("foil");
  });

  it("normalizes language from full name", () => {
    const csv = `${header}\n2,0,Buff,OGN-XXX,Origins,,Common,0.00,0.00,NM:2,,,Chinese`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("ZH");
  });

  it("skips rows with both quantities at zero", () => {
    const csv = `${header}\n0,0,Invisible Card,OGN-999,Origins,,Common,0.00,0.00,,,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(0);
  });

  it("reports errors for unparseable card IDs", () => {
    const csv = `${header}\n1,0,Bad Card,INVALID,Origins,,Common,0.00,0.00,NM:1,,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toContain('Could not parse Card ID: "INVALID"');
  });

  it("populates rawFields for display", () => {
    const csv = `${header}\n1,0,Buff,OGN-XXX,Origins,,Common,0.21,0.00,NM:1,,,English`;
    const result = parseImportData(csv);
    const raw = result.entries[0].rawFields;
    expect(raw["Source Code"]).toBe("OGN-XXX");
    expect(raw["Set"]).toBe("Origins");
    expect(raw["Rarity"]).toBe("Common");
    expect(raw["Language"]).toBe("English");
    expect(raw["Condition"]).toBe("NM:1");
  });

  it("returns empty entries for missing required columns", () => {
    const csv = "Normal Qty,Foil Qty,Card Name\n1,0,Test";
    const result = parseImportData(csv);
    expect(result.source).toBe("riftmana");
    expect(result.entries).toHaveLength(0);
    expect(result.errors).toContain('Missing required column: "Card ID".');
  });

  it("parses the full sample data", () => {
    const csv = [
      header,
      "1,0,Buff,OGN-XXX,Origins,,Common,0.21,0.00,NM:1,,,English",
      "1,2,Blazing Scorcher,OGN-001,Origins,Fury,Common,0.11,0.25,NM:1,NM:2,,English",
      "0,1,Fury Rune,OGN-007a,Origins,Fury,Showcase,0.48,9.41,,NM:1,,English",
      "0,3,Get Excited!,OGN-008,Origins,Fury,Common,0.09,0.34,,NM:3,,English",
      "0,1,Immortal Phoenix,OGN-037,Origins,Fury,Epic,0.00,27.99,,NM:1,,English",
      "0,1,Kadregrin the Infernal,OGN-038,Origins,Fury,Epic,0.00,18.21,,NM:1,,English",
      "0,1,Volibear Furious,OGN-041a,Origins,Fury,Showcase,0.00,5.25,,NM:1,,English",
      "0,1,Caitlyn Patrolling,OGN-068,Origins,Calm,Rare,0.00,0.39,,,,English",
      "0,1,Jinx Loose Cannon,OGN-301*,Origins,Fury Chaos,Showcase,0.00,960.52,,NM:1,,English",
      "0,1,Darius Hand of Noxus,OGN-302,Origins,Fury Order,Showcase,0.00,53.60,,NM:1,,English",
      "0,1,Darius Hand of Noxus,OGN-302*,Origins,Fury Order,Showcase,0.00,619.99,,NM:1,,English",
      "0,1,Ahri Nine-Tailed Fox,OGN-303,Origins,Calm Mind,Showcase,0.00,222.58,,NM:1,,English",
      "2,0,Buff,OGN-XXX,Origins,,Common,0.00,0.00,NM:2,,,Chinese",
      "1,2,Brazen Buccaneer,OGN-002,Origins,Fury,Common,0.00,0.00,NM:1,NM:2,,Chinese",
      "1,2,Chemtech Enforcer,OGN-003,Origins,Fury,Common,0.00,0.00,NM:1,NM:2,,Chinese",
      "0,2,Buff,OGN-XXX-P,Promotional Cards,,Common,0.00,125.33,,NM:2,,English",
      "0,8,Blazing Scorcher,OGN-001-p,Promotional Cards,Fury,Common,0.00,0.24,,NM:4;HP:3;SEAL:1,,English",
      "0,1,Pouty Poro,OGN-013-p,Promotional Cards,Fury,Common,0.00,0.44,,NM:1,,English",
      "0,5,Caitlyn Patrolling,OGN-068a,Promotional Cards,Calm,Showcase,0.00,0.00,,,,Chinese",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.source).toBe("riftmana");
    expect(result.errors).toHaveLength(0);
    expect(result.rowCount).toBe(19);
    // Rows with both normal+foil: Blazing Scorcher, Brazen Buccaneer, Chemtech Enforcer = 3 rows → 6 entries
    // Rows with only one qty: 16 rows → 16 entries
    // Total: 22 entries
    expect(result.entries).toHaveLength(22);
  });
});

describe("parseImportData — Piltover Archive language", () => {
  const header =
    "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Quantity,Language,Condition";

  it("normalizes English to EN", () => {
    const csv = `${header}\nOGN-001,Test,Origins,OGN,Common,Standard,,1,English,NM`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("EN");
  });

  it("normalizes French to FR", () => {
    const csv = `${header}\nOGN-001,Test,Origins,OGN,Common,Standard,,1,French,NM`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("FR");
  });

  it("normalizes Chinese to ZH", () => {
    const csv = `${header}\nOGN-001,Test,Origins,OGN,Common,Standard,,1,Chinese,NM`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("ZH");
  });

  it("handles two-letter code directly", () => {
    const csv = `${header}\nOGN-001,Test,Origins,OGN,Common,Standard,,1,EN,NM`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("EN");
  });

  it("returns undefined for missing language column", () => {
    const csv = "Variant Number,Card Name,Quantity\nOGN-001,Test,1";
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBeUndefined();
  });

  it("keeps rows with different languages separate", () => {
    const csv = [
      header,
      "OGN-001,Test,Origins,OGN,Common,Standard,,1,English,NM",
      "OGN-001,Test,Origins,OGN,Common,Standard,,2,Chinese,NM",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(2);
    const byLanguage = new Map(result.entries.map((e) => [e.language, e.quantity]));
    expect(byLanguage.get("EN")).toBe(1);
    expect(byLanguage.get("ZH")).toBe(2);
  });

  it("still aggregates same-language rows with different conditions", () => {
    const csv = [
      header,
      "OGN-001,Test,Origins,OGN,Common,Standard,,1,English,NM",
      "OGN-001,Test,Origins,OGN,Common,Standard,,2,English,LP",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].quantity).toBe(3);
    expect(result.entries[0].language).toBe("EN");
  });
});

describe("parseImportData — Piltover Archive promo", () => {
  const header =
    "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Quantity,Language,Condition";

  it("sets isPromo when a promo suffix is present", () => {
    const csv = `${header}\nOGN-001-Nexus,Hero,Origins,OGN,Common,Standard,Nexus,1,English,NM`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].isPromo).toBe(true);
    expect(result.entries[0].sourceCode).toBe("OGN-001");
  });

  it("leaves isPromo undefined for non-promo rows", () => {
    const csv = `${header}\nOGN-001,Hero,Origins,OGN,Common,Standard,,1,English,NM`;
    const result = parseImportData(csv);
    expect(result.entries[0].isPromo).toBeUndefined();
  });

  it("keeps rows with different promo suffixes separate", () => {
    const csv = [
      header,
      "OGN-001-Nexus,Hero,Origins,OGN,Common,Standard,Nexus,1,English,NM",
      "OGN-001-Launch,Hero,Origins,OGN,Common,Standard,Launch,2,English,NM",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(2);
    const quantities = result.entries.map((e) => e.quantity).toSorted();
    expect(quantities).toEqual([1, 2]);
  });

  it("aggregates rows with the same promo suffix and different conditions", () => {
    const csv = [
      header,
      "OGN-001-Nexus,Hero,Origins,OGN,Common,Standard,Nexus,1,English,NM",
      "OGN-001-Nexus,Hero,Origins,OGN,Common,Standard,Nexus,2,English,LP",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].quantity).toBe(3);
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

  it("still detects RiftMana format", () => {
    const csv =
      "Normal Qty,Foil Qty,Card Name,Card ID,Set,Color,Rarity,Normal Price,Foil Price,Normal Condition,Foil Condition,Notes,Language\n1,0,Test,OGN-001,Origins,,Common,0.00,0.00,NM:1,,,English";
    const result = parseImportData(csv);
    expect(result.source).toBe("riftmana");
  });

  it("returns error for unrecognized format", () => {
    const csv = "Unknown,Headers,Here\nfoo,bar,baz";
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(0);
    expect(result.errors[0]).toContain("OpenRift");
  });
});
