// oxlint-disable typescript/dot-notation -- record keys are CSV column headers; bracket access stays uniform across headers that do and don't contain spaces

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

  it("reads the Overnumbered column", () => {
    const headerWithOver =
      "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Overnumbered,Promo,Quantity";
    const csv = `${headerWithOver}\nOGN-123*,Rare Beast,Showcase,Unit,Nature,foil,normal,Yes,,2`;
    const result = parseImportData(csv);
    const entry = result.entries[0];
    expect(entry.isOvernumbered).toBe(true);
    expect(entry.artVariant).toBe("normal");
    expect(entry.sourceCode).toBe("OGN-123*");
  });

  it("reads an empty Overnumbered cell as not overnumbered", () => {
    const headerWithOver =
      "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Overnumbered,Promo,Quantity";
    const csv = `${headerWithOver}\nOGN-001,Test Card,Common,Unit,Arcane,normal,normal,,,1`;
    expect(parseImportData(csv).entries[0].isOvernumbered).toBe(false);
  });

  it("reads a pre-column export's `overnumbered` art variant as the flag", () => {
    const csv = `${header}\nOGN-123*,Rare Beast,Showcase,Unit,Nature,foil,overnumbered,,2`;
    const result = parseImportData(csv);
    const entry = result.entries[0];
    expect(entry.isOvernumbered).toBe(true);
    expect(entry.artVariant).toBe("normal");
  });

  it("leaves the flag unset for a pre-column export row not typed overnumbered", () => {
    const csv = `${header}\nUNL-238,Baron Nashor,Showcase,Unit,Chaos,foil,ultimate,,1`;
    const entry = parseImportData(csv).entries[0];
    expect(entry.isOvernumbered).toBeUndefined();
    expect(entry.artVariant).toBe("ultimate");
  });

  it("handles token short codes", () => {
    const csv = `${header}\nSFD-T01,Token Creature,Common,Unit,Arcane,normal,normal,,1`;
    const result = parseImportData(csv);
    const entry = result.entries[0];
    expect(entry.setPrefix).toBe("SFD");
  });

  it("handles bare set-code short codes (the OGN Buff tokens)", () => {
    const csv = `${header}\nOGN,Buff,Common,Other,,normal,normal,,2`;
    const result = parseImportData(csv);
    expect(result.errors).toHaveLength(0);
    const entry = result.entries[0];
    expect(entry.setPrefix).toBe("OGN");
    expect(entry.sourceCode).toBe("OGN");
    expect(entry.quantity).toBe(2);
  });

  it("parses a multi-marker promo cell joined with +", () => {
    const csv = `${header}\nOGN-001,Hero,Common,Unit,Arcane,foil,normal,release+nexus,1`;
    const result = parseImportData(csv);
    expect(result.entries[0].promoSlug).toBe("release+nexus");
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
    const csv = `${headerWithLang}\nOGN-001,Test Card,Common,Unit,Arcane,normal,normal,,SC,1`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("SC");
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

  it("keeps the `*` suffix in the short code", () => {
    const csv = `${header}\n0,1,Jinx Loose Cannon,OGN-301*,Origins,Fury Chaos,Showcase,0.00,960.52,,NM:1,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].artVariant).toBe("normal");
    expect(result.entries[0].sourceCode).toBe("OGN-301*");
  });

  it("strips lowercase -p promo suffix and sets isPromo", () => {
    const csv = `${header}\n0,8,Blazing Scorcher,OGN-001-p,Promotional Cards,Fury,Common,0.00,0.24,,NM:4;HP:3;SEAL:1,,English`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(3);
    expect(result.entries.every((e) => e.sourceCode === "OGN-001")).toBe(true);
    expect(result.entries.every((e) => e.setPrefix === "OGN")).toBe(true);
    expect(result.entries.every((e) => e.isPromo === true)).toBe(true);
    const byCondition = new Map(result.entries.map((e) => [e.metadata?.condition, e.quantity]));
    expect(byCondition.get("near-mint")).toBe(4);
    expect(byCondition.get("poor")).toBe(3);
    expect(byCondition.get(undefined)).toBe(1);
    const conditionsShown = result.entries.map((e) => e.rawFields["Condition"]);
    expect(conditionsShown).toEqual(["NM", "HP", "SEAL"]);
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
    expect(result.entries[0].language).toBe("SC");
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
    expect(raw["Condition"]).toBe("NM");
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
    // 3 dual-qty rows (6) + 16 single-qty rows (16) + 2 extra splits from the NM:4;HP:3;SEAL:1 encoding.
    expect(result.entries).toHaveLength(24);
  });
});

describe("parseImportData — Piltover Archive language", () => {
  const header =
    "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Foil,Quantity," +
    "Language,Condition,Grading Company,Grading Value,Grading Label,Notes";

  it("normalizes English to EN", () => {
    const csv = `${header}\nOGN-001,Test,Origins,OGN,Common,Standard,Standard,false,1,English,Near Mint,,,,`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("EN");
  });

  it("normalizes French to FR", () => {
    const csv = `${header}\nOGN-001,Test,Origins,OGN,Common,Standard,Standard,false,1,French,Near Mint,,,,`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("FR");
  });

  it("normalizes Chinese to SC", () => {
    const csv = `${header}\nOGN-001,Test,Origins,OGN,Common,Standard,Standard,false,1,Chinese,Near Mint,,,,`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("SC");
  });

  it("handles two-letter code directly", () => {
    const csv = `${header}\nOGN-001,Test,Origins,OGN,Common,Standard,Standard,false,1,EN,Near Mint,,,,`;
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBe("EN");
  });

  it("returns undefined for missing language column", () => {
    const csv = "Variant Number,Card Name,Quantity,Foil\nOGN-001,Test,1,false";
    const result = parseImportData(csv);
    expect(result.entries[0].language).toBeUndefined();
  });

  it("keeps rows with different languages separate", () => {
    const csv = [
      header,
      "OGN-001,Test,Origins,OGN,Common,Standard,Standard,false,1,English,Near Mint,,,,",
      "OGN-001,Test,Origins,OGN,Common,Standard,Standard,false,2,Chinese,Near Mint,,,,",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(2);
    const byLanguage = new Map(result.entries.map((e) => [e.language, e.quantity]));
    expect(byLanguage.get("EN")).toBe(1);
    expect(byLanguage.get("SC")).toBe(2);
  });

  it("keeps same-language rows with different conditions separate (ADR-038)", () => {
    const csv = [
      header,
      "OGN-001,Test,Origins,OGN,Common,Standard,Standard,false,1,English,Near Mint,,,,",
      "OGN-001,Test,Origins,OGN,Common,Standard,Standard,false,2,English,Light Played,,,,",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(2);
    const byCondition = new Map(result.entries.map((e) => [e.metadata?.condition, e.quantity]));
    expect(byCondition.get("near-mint")).toBe(1);
    expect(byCondition.get("light-played")).toBe(2);
    expect(result.entries.every((e) => e.language === "EN")).toBe(true);
  });

  it("aggregates rows with the same condition", () => {
    const csv = [
      header,
      "OGN-001,Test,Origins,OGN,Common,Standard,Standard,false,1,English,Near Mint,,,,",
      "OGN-001,Test,Origins,OGN,Common,Standard,Standard,false,2,English,Near Mint,,,,",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].quantity).toBe(3);
    expect(result.entries[0].metadata?.condition).toBe("near-mint");
  });
});

describe("parseImportData — Piltover Archive variant columns", () => {
  const header =
    "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Foil,Quantity," +
    "Language,Condition,Grading Company,Grading Value,Grading Label,Notes";

  it("reads the promo from the Variant Type, keeping the variant number intact", () => {
    const csv = `${header}\nOGN-089b,Mind Rune,Origins | Nexus Night,OGN-NN,Showcase,Promo,OGN Nexus Night Promo,true,4,English,Near Mint,,,,`;
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      sourceCode: "OGN-089b",
      isPromo: true,
      finish: "foil",
      artVariant: "altart",
    });
  });

  it("leaves isPromo undefined for a standard row", () => {
    const csv = `${header}\nOGN-090,Orb of Regret,Origins,OGN,Common,Standard,Standard,false,4,English,Near Mint,,,,`;
    const result = parseImportData(csv);
    expect(result.entries[0].isPromo).toBeUndefined();
  });

  it("takes the finish from the Foil column, not the rarity", () => {
    const csv = [
      header,
      "OGN-001,Blazing Scorcher,Origins,OGN,Common,Standard,Standard,true,1,English,Near Mint,,,,",
      "OGN-025,Showcase Card,Origins,OGN,Showcase,Standard,Standard,false,1,English,Near Mint,,,,",
    ].join("\n");
    const result = parseImportData(csv);
    const byCode = new Map(result.entries.map((entry) => [entry.sourceCode, entry]));
    expect(byCode.get("OGN-001")?.finish).toBe("foil");
    expect(byCode.get("OGN-025")?.finish).toBe("normal");
  });

  it("keeps the signed marker in the variant number", () => {
    const csv = `${header}\nOGN-309*,"Sett, The Boss",Origins,OGN,Showcase,Overnumbered,Overnumbered Signed,true,4,English,Near Mint,,,,`;
    const result = parseImportData(csv);
    expect(result.entries[0]).toMatchObject({
      sourceCode: "OGN-309*",
      isOvernumbered: true,
      artVariant: "normal",
    });
  });

  it("reads grading and notes into the copy metadata", () => {
    const csv = `${header}\nOGN-001,Blazing Scorcher,Origins,OGN,Common,Standard,Standard,false,1,English,,PSA,9,PSA 9 MINT,lolli`;
    const result = parseImportData(csv);
    expect(result.entries[0].metadata).toEqual({
      grader: "psa",
      grade: 9,
      notesPublic: "lolli",
    });
  });

  it("keeps a graded copy out of the raw copies beside it (ADR-038)", () => {
    const csv = [
      header,
      "OGN-001,Blazing Scorcher,Origins,OGN,Common,Standard,Standard,false,1,English,,PSA,9,PSA 9 MINT,lolli",
      "OGN-001,Blazing Scorcher,Origins,OGN,Common,Standard,Standard,false,1,English,,,,,",
    ].join("\n");
    const result = parseImportData(csv);
    expect(result.entries).toHaveLength(2);
    const graded = result.entries.find((entry) => entry.metadata?.grader === "psa");
    expect(graded?.quantity).toBe(1);
    expect(graded?.metadata).toMatchObject({ grade: 9, notesPublic: "lolli" });
  });

  it("rejects a file with no Foil column rather than importing everything as non-foil", () => {
    const csv = "Variant Number,Card Name,Quantity\nOGN-001,Blazing Scorcher,1";
    const result = parseImportData(csv);
    expect(result.entries).toEqual([]);
    expect(result.errors).toContain('Missing required column: "Foil".');
  });
});

describe("parseImportData — a real Piltover Archive export", () => {
  // Verbatim rows covering every variant shape: plain, alt art, promo, Ultimate, signed, `-Suffix`.
  const CSV = [
    "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Foil,Quantity,Language,Condition,Grading Company,Grading Value,Grading Label,Notes",
    "OGN-089,Mind Rune,Origins,OGN,Common,Standard,OGN Rune,false,4,English,Near Mint,,,,",
    "OGN-089a,Mind Rune,Origins,OGN,Showcase,Alt Art,OGN Foil,true,4,English,Near Mint,,,,",
    "OGN-089b,Mind Rune,Origins | Nexus Night,OGN-NN,Showcase,Promo,OGN Nexus Night Promo,true,4,English,Near Mint,,,,",
    "UNL-238,Baron Nashor,Unleashed,UNL,Showcase,Overnumbered,Ultimate,true,4,English,Near Mint,,,,",
    'OGN-300*,"Volibear, Relentless Storm",Origins,OGN,Showcase,Overnumbered Signed,Overnumbered Signed,true,4,English,Near Mint,,,,',
    'OGN-309,"Miss Fortune, Bounty Hunter",Origins,OGN,Showcase,Overnumbered,Overnumbered,true,4,English,Near Mint,,,,',
    'OGN-151b-Nexus,"Lee Sin, Centered",Unleashed | Nexus Night,UNL-NN,Showcase,Promo,Nexus Night Promo,true,4,English,Near Mint,,,,',
    'OGN-263-Worlds,"Teemo, Swift Scout",Worlds Bundle 2025,WRLD25,Showcase,Promo,Worlds 2025 Bundle,true,4,English,Near Mint,,,,',
    "OGN-001,Blazing Scorcher,Origins,OGN,Common,Standard,Standard,false,1,English,,PSA,9,PSA 9 MINT,lolli",
    "OGN-001,Blazing Scorcher,Origins,OGN,Common,Standard,Standard,false,1,English,,,,,",
  ].join("\n");

  const result = parseImportData(CSV);
  const byCode = new Map(
    result.entries.map((entry) => [`${entry.sourceCode}::${entry.metadata?.grader ?? ""}`, entry]),
  );

  it("parses every row without error", () => {
    expect(result.source).toBe("piltover-archive");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(10);
  });

  it("keeps the variant number verbatim, letter suffix and signed marker included", () => {
    expect(byCode.has("OGN-089a::")).toBe(true);
    expect(byCode.has("OGN-300*::")).toBe(true);
  });

  it("strips only the promo suffix their `-Suffix` forms carry", () => {
    expect(byCode.get("OGN-151b::")).toMatchObject({ isPromo: true, artVariant: "altart" });
    expect(byCode.get("OGN-263::")).toMatchObject({ isPromo: true, artVariant: "normal" });
  });

  it("reads the finish from the Foil column alone", () => {
    expect(byCode.get("OGN-089::")?.finish).toBe("normal");
    expect(byCode.get("OGN-089a::")?.finish).toBe("foil");
  });

  it("treats `*` as signed, not as an art variant", () => {
    expect(byCode.get("OGN-300*::")?.isOvernumbered).toBe(true);
    expect(byCode.get("OGN-300*::")?.artVariant).toBe("normal");
    expect(byCode.get("OGN-309::")?.isOvernumbered).toBe(true);
  });

  it("takes Ultimate from the label and keeps the Overnumbered type as the flag", () => {
    expect(byCode.get("UNL-238::")?.artVariant).toBe("ultimate");
    expect(byCode.get("UNL-238::")?.isOvernumbered).toBe(true);
  });

  it("keeps a graded copy out of the raw copy beside it (ADR-038)", () => {
    expect(byCode.get("OGN-001::psa")).toMatchObject({
      quantity: 1,
      metadata: { grader: "psa", grade: 9, notesPublic: "lolli" },
    });
    expect(byCode.get("OGN-001::")?.quantity).toBe(1);
  });

  it("keeps a promo apart from the plain printing it shares a code with", () => {
    const csv = [
      "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Foil,Quantity,Language,Condition,Grading Company,Grading Value,Grading Label,Notes",
      'OGN-263,"Teemo, Swift Scout",Origins,OGN,Rare,Standard,Standard,true,4,English,Near Mint,,,,',
      'OGN-263-Worlds,"Teemo, Swift Scout",Worlds Bundle 2025,WRLD25,Showcase,Promo,Worlds 2025 Bundle,true,4,English,Near Mint,,,,',
    ].join("\n");
    const promoPair = parseImportData(csv);
    expect(promoPair.entries).toHaveLength(2);
    expect(promoPair.entries.map((entry) => entry.quantity)).toEqual([4, 4]);
    expect(promoPair.entries.filter((entry) => entry.isPromo)).toHaveLength(1);
  });

  it("records conditions written as full words", () => {
    expect(byCode.get("OGN-089::")?.metadata?.condition).toBe("near-mint");
  });
});

describe("parseImportData — format detection", () => {
  it("still detects Piltover Archive format", () => {
    const csv = "Variant Number,Card Name,Quantity,Foil\nOGN-001,Test,1,false";
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
