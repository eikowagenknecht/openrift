import type { ListEntryDetailResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { formatCardListAsDeckText } from "./list-export";
import { parseCardListText } from "./list-import-parser";

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
    cardType: "unit",
  };
}

describe("parseCardListText", () => {
  it("parses `<qty> <name>` lines into ImportEntry shapes with synthetic defaults", () => {
    const result = parseCardListText("1 Teemo, Scout\n3 Jinx, Radical");
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
    expect(result.entries[1].cardName).toBe("Jinx, Radical");
  });

  it("skips blank lines without raising errors", () => {
    const result = parseCardListText("\n\n2 Teemo, Scout\n\n  \n1 Jinx, Radical\n");
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
    const result = parseCardListText("Teemo, Scout\n3 Jinx, Radical\nbroken");
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("Line 1");
    expect(result.errors[1]).toContain("Line 3");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].cardName).toBe("Jinx, Radical");
  });

  it("rejects non-positive quantities", () => {
    const result = parseCardListText("0 Teemo, Scout\n2 Jinx, Radical");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("greater than zero");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].cardName).toBe("Jinx, Radical");
  });

  it("tolerates CRLF line endings (iOS clipboard round-trip)", () => {
    const result = parseCardListText("1 Teemo, Scout\r\n2 Jinx, Radical\r\n");
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
  });

  it("round-trips with formatCardListAsDeckText", () => {
    const exported = formatCardListAsDeckText([
      cardEntry("e1", "c1", "Teemo, Scout", 1),
      cardEntry("e2", "c2", "Kai’Sa, Survivor", 2),
      cardEntry("e3", "c3", "Jinx, Radical", 3),
    ]);
    const result = parseCardListText(exported);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => `${entry.quantity} ${entry.cardName}`)).toEqual([
      "1 Teemo, Scout",
      "2 Kai'Sa, Survivor",
      "3 Jinx, Radical",
    ]);
  });
});
