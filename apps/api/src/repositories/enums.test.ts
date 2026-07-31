import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { enumsRepo } from "./enums.js";

describe("enumsRepo", () => {
  it("keepPriorityOrders maps each dimension to its slugs in query order", async () => {
    const db = createMockDb([{ slug: "normal" }, { slug: "foil" }]);
    expect(await enumsRepo(db).keepPriorityOrders()).toEqual({
      finishes: ["normal", "foil"],
      rarities: ["normal", "foil"],
      artVariants: ["normal", "foil"],
    });
  });

  it("contentVersion returns the digest token", async () => {
    const db = createMockDb({ rows: [{ token: "abc|def" }] });
    expect(await enumsRepo(db).contentVersion()).toBe("abc|def");
  });

  it("contentVersion falls back to an empty token when the probe returns no row", async () => {
    const db = createMockDb({ rows: [] });
    expect(await enumsRepo(db).contentVersion()).toBe("");
  });

  it("all() returns every reference table keyed by name", async () => {
    const db = createMockDb([{ slug: "a", label: "A", sortOrder: 1 }]);
    const result = await enumsRepo(db).all();
    expect(Object.keys(result).toSorted()).toEqual(
      [
        "artVariants",
        "cardSizes",
        "cardTypes",
        "conditions",
        "deckFormats",
        "deckZones",
        "domains",
        "finishes",
        "graders",
        "languages",
        "markers",
        "rarities",
        "superTypes",
      ].toSorted(),
    );
  });
});
