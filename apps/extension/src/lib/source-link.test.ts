import { describe, expect, it } from "vitest";

import { deckSourceLink } from "./source-link";

describe("deckSourceLink", () => {
  it("keeps a URL on an allowlisted deck site", () => {
    expect(deckSourceLink("https://riftdecks.com/deck/42")).toBe("https://riftdecks.com/deck/42");
  });

  it("keeps the query and hash, which carry the deck's identity", () => {
    expect(deckSourceLink("https://piltoverarchive.com/decks?id=7#main")).toBe(
      "https://piltoverarchive.com/decks?id=7#main",
    );
  });

  it("strips campaign tracking parameters", () => {
    expect(deckSourceLink("https://riftmana.com/d/9?utm_source=x&utm_medium=social&page=2")).toBe(
      "https://riftmana.com/d/9?page=2",
    );
  });

  it("drops the whole query when it was only tracking", () => {
    expect(deckSourceLink("https://riftmana.com/d/9?fbclid=abc")).toBe("https://riftmana.com/d/9");
  });

  it("drops a host that is not allowlisted", () => {
    expect(deckSourceLink("https://example.test/deck/42")).toBeUndefined();
  });

  it("drops a non-https page", () => {
    expect(deckSourceLink("http://riftdecks.com/deck/42")).toBeUndefined();
  });

  it("drops a URL longer than a deck link may be", () => {
    expect(deckSourceLink(`https://riftdecks.com/deck/${"x".repeat(500)}`)).toBeUndefined();
  });

  it("drops a malformed URL", () => {
    expect(deckSourceLink("not a url")).toBeUndefined();
  });
});
