import type { ListEntryDetailResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { EMPTY_TRADE_PREFERENCE } from "@/test/factories";

import { formatCardListAsDeckText } from "./list-export";
import { parseCardListText, parseListImport } from "./list-import-parser";

function cardEntry(
  id: string,
  cardId: string,
  cardName: string,
  quantity: number,
): ListEntryDetailResponse {
  return {
    id,
    listId: "list-1",
    kind: "card",
    cardId,
    quantity,
    cardName,
    ruleQuantity: 0,
    source: "manual",
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

describe("parseCardListText", () => {
  it("parses `<qty> <name>` lines into ImportEntry shapes with synthetic defaults", () => {
    const result = parseCardListText("1 Teemo, Scout\n3 Jinx, Rebel");
    expect(result.errors).toEqual([]);
    expect(result.rowCount).toBe(2);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      cardName: "Teemo, Scout",
      quantity: 1,
      finish: "normal",
      artVariant: "normal",
      sourceCode: "",
      setPrefix: "",
    });
    expect(result.entries[1].cardName).toBe("Jinx, Rebel");
  });

  it("skips blank lines without raising errors", () => {
    const result = parseCardListText("\n\n2 Teemo, Scout\n\n  \n1 Jinx, Rebel\n");
    expect(result.errors).toEqual([]);
    expect(result.rowCount).toBe(2);
    expect(result.entries).toHaveLength(2);
  });

  it("merges duplicate names by summing quantities, normalized so styling differences collapse", () => {
    const result = parseCardListText("1 Kai'Sa, Survivor\n2 KaiSa Survivor\n1 Kai’Sa, Survivor");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].quantity).toBe(4);
    expect(result.entries[0].cardName).toBe("Kai'Sa, Survivor");
  });

  it("reports malformed lines as errors and keeps parsing the rest", () => {
    const result = parseCardListText("Teemo, Scout\n3 Jinx, Rebel\nbroken");
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("Line 1");
    expect(result.errors[1]).toContain("Line 3");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].cardName).toBe("Jinx, Rebel");
  });

  it("rejects non-positive quantities", () => {
    const result = parseCardListText("0 Teemo, Scout\n2 Jinx, Rebel");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("greater than zero");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].cardName).toBe("Jinx, Rebel");
  });

  it("tolerates CRLF line endings (iOS clipboard round-trip)", () => {
    const result = parseCardListText("1 Teemo, Scout\r\n2 Jinx, Rebel\r\n");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
  });

  it("round-trips with formatCardListAsDeckText", () => {
    const exported = formatCardListAsDeckText([
      cardEntry("e1", "c1", "Teemo, Scout", 1),
      cardEntry("e2", "c2", "Kai’Sa, Survivor", 2),
      cardEntry("e3", "c3", "Jinx, Rebel", 3),
    ]);
    const result = parseCardListText(exported);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => `${entry.quantity} ${entry.cardName}`)).toEqual([
      "1 Teemo, Scout",
      "2 Kai'Sa, Survivor",
      "3 Jinx, Rebel",
    ]);
  });
});

describe("parseListImport", () => {
  it("falls back to plain-text parsing when no CSV format is detected", () => {
    const result = parseListImport("1 Teemo, Scout\n3 Jinx, Rebel");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
    // Plain text carries no printing detail — no source code, default finish.
    expect(result.entries[0]).toMatchObject({
      cardName: "Teemo, Scout",
      sourceCode: "",
      finish: "normal",
    });
  });

  it("routes a Piltover Archive CSV through the rich parser, preserving printing detail", () => {
    const csv = [
      "Variant Number,Card Name,Set Prefix,Rarity,Variant Label,Quantity,Language",
      "OGN-001-Foil,Blazing Scorcher,OGN,common,Foil,2,EN",
    ].join("\n");
    const result = parseListImport(csv);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      cardName: "Blazing Scorcher",
      quantity: 2,
      finish: "foil",
      sourceCode: "OGN-001",
    });
  });

  it("routes an OpenRift CSV through the rich parser", () => {
    const csv = [
      "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Promo,Language,Quantity",
      "OGN-007a,Fury Rune,common,rune,fury,normal,altart,,EN,3",
    ].join("\n");
    const result = parseListImport(csv);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      cardName: "Fury Rune",
      quantity: 3,
      artVariant: "altart",
      sourceCode: "OGN-007a",
    });
  });
});
