import { describe, expect, it } from "vitest";

import { Route } from "./import";

const validateSearch = Route.options.validateSearch as (
  search: Record<string, unknown>,
) => Record<string, unknown>;

describe("/decks/import validateSearch", () => {
  it("passes through code and replaceDeckId strings", () => {
    expect(validateSearch({ code: "Legend:\n1 Ekko", replaceDeckId: "deck-1" })).toEqual({
      code: "Legend:\n1 Ekko",
      replaceDeckId: "deck-1",
    });
  });

  it("drops empty and non-string values", () => {
    expect(validateSearch({ code: "", name: "", replaceDeckId: 5, extra: "x" })).toEqual({});
  });

  it("trims the deck name and clamps it to the contract limit", () => {
    expect(validateSearch({ name: "  My Deck  " })).toEqual({ name: "My Deck" });
    const long = "x".repeat(300);
    expect(validateSearch({ name: long })).toEqual({ name: "x".repeat(200) });
  });

  it("drops a whitespace-only deck name", () => {
    expect(validateSearch({ name: "   " })).toEqual({});
  });

  it("keeps a source link on an allowlisted host", () => {
    expect(validateSearch({ source: "https://riftdecks.com/deck/42" })).toEqual({
      source: "https://riftdecks.com/deck/42",
    });
  });

  it("drops a source link the deck-link schema would reject", () => {
    expect(validateSearch({ source: "https://example.test/deck/42" })).toEqual({});
    expect(validateSearch({ source: "http://riftdecks.com/deck/42" })).toEqual({});
    // oxlint-disable-next-line no-script-url -- rejecting a script URL is the case
    expect(validateSearch({ source: "javascript:alert(1)" })).toEqual({});
    expect(validateSearch({ source: `https://riftdecks.com/${"x".repeat(500)}` })).toEqual({});
  });
});
