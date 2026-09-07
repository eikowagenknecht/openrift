import { describe, expect, it } from "vitest";

import { decksKeys } from "./decks-query-keys";

describe("decksKeys", () => {
  it("all keys per user", () => {
    expect(decksKeys.all("user-1")).toEqual(["decks", "user-1"]);
  });

  it("detail keys per (user, deck)", () => {
    expect(decksKeys.detail("user-1", "deck-1")).toEqual(["decks", "user-1", "deck-1"]);
  });
});
