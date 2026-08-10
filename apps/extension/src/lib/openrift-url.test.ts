import { describe, expect, it } from "vitest";

import { deckImportUrl } from "./openrift-url";

describe("deckImportUrl", () => {
  it("URL-encodes the payload into the code param", () => {
    expect(deckImportUrl("Legend:\n1 Ekko")).toBe(
      "https://openrift.app/decks/import?code=Legend%3A%0A1%20Ekko",
    );
  });

  it("appends an encoded name param when a deck name is given", () => {
    expect(deckImportUrl("CODE123456789ABC", { name: "Diana, Scorn of the Moon" })).toBe(
      "https://openrift.app/decks/import?code=CODE123456789ABC&name=Diana%2C%20Scorn%20of%20the%20Moon",
    );
  });

  it("appends an encoded source param when the page can be a deck link", () => {
    expect(
      deckImportUrl("CODE123456789ABC", { source: "https://riftdecks.com/deck/42?id=7" }),
    ).toBe(
      "https://openrift.app/decks/import?code=CODE123456789ABC&source=https%3A%2F%2Friftdecks.com%2Fdeck%2F42%3Fid%3D7",
    );
  });

  it("omits the optional params when nothing rides along", () => {
    const url = deckImportUrl("CODE123456789ABC");
    expect(url).not.toContain("name=");
    expect(url).not.toContain("source=");
  });
});
