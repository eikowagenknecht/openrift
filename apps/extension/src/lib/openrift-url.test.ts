import { describe, expect, it } from "vitest";

import { deckImportUrl } from "./openrift-url";

describe("deckImportUrl", () => {
  it("URL-encodes the payload into the code param", () => {
    expect(deckImportUrl("Legend:\n1 Ekko")).toBe(
      "https://openrift.app/decks/import?code=Legend%3A%0A1%20Ekko",
    );
  });

  it("appends an encoded name param when a deck name is given", () => {
    expect(deckImportUrl("CODE123456789ABC", "Diana, Scorn of the Moon")).toBe(
      "https://openrift.app/decks/import?code=CODE123456789ABC&name=Diana%2C%20Scorn%20of%20the%20Moon",
    );
  });

  it("omits the name param without a deck name", () => {
    expect(deckImportUrl("CODE123456789ABC")).not.toContain("name=");
  });
});
