import type { AcceptNewCardBody } from "@openrift/shared/contracts";
import { describe, expect, it } from "vitest";

import { describeAcceptCardFieldIssues } from "./accept-card-validation";

type CardFields = AcceptNewCardBody["cardFields"];

const validCard: CardFields = {
  id: "kennen-storm-of-shuriken",
  name: "Kennen, Storm of Shuriken",
  types: ["unit"],
  domains: ["fury"],
  energy: 3,
  power: 2,
  might: null,
};

describe("describeAcceptCardFieldIssues", () => {
  it("returns no issues for valid card fields", () => {
    expect(describeAcceptCardFieldIssues(validCard)).toEqual([]);
  });

  // Regression: numeric fields hand-edited in the spreadsheet used to commit as
  // strings, which the API rejected with a generic "Input validation failed".
  it("names a numeric field committed as a string", () => {
    const card = { ...validCard, energy: "3" } as unknown as CardFields;
    expect(describeAcceptCardFieldIssues(card)).toEqual(["Energy: must be a whole number"]);
  });

  it("flags an empty Domains list", () => {
    const card = { ...validCard, domains: [] };
    expect(describeAcceptCardFieldIssues(card)).toEqual(["Domains: needs at least one entry"]);
  });

  it("flags a Domains entry that is blank", () => {
    const card = { ...validCard, domains: [""] };
    expect(describeAcceptCardFieldIssues(card)).toEqual(["Domains: is required"]);
  });

  it("flags an empty Types list", () => {
    const card = { ...validCard, types: [] };
    expect(describeAcceptCardFieldIssues(card)).toEqual(["Types: needs at least one entry"]);
  });

  it("flags a Types entry that is blank", () => {
    const card = { ...validCard, types: [""] };
    expect(describeAcceptCardFieldIssues(card)).toEqual(["Types: is required"]);
  });

  it("flags a missing required field", () => {
    const { name: _omitted, ...card } = validCard;
    expect(describeAcceptCardFieldIssues(card as CardFields)).toEqual(["Name: is required"]);
  });

  it("flags a negative number", () => {
    const card = { ...validCard, power: -1 };
    expect(describeAcceptCardFieldIssues(card)).toEqual(["Power: must be 0 or higher"]);
  });

  it("reports every invalid field at once", () => {
    const card = { ...validCard, energy: "x", domains: [], types: [] } as unknown as CardFields;
    expect(describeAcceptCardFieldIssues(card)).toEqual([
      "Types: needs at least one entry",
      "Domains: needs at least one entry",
      "Energy: must be a whole number",
    ]);
  });
});
