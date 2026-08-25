import { EMPTY_CARD_FILTERS, EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import type { Printing } from "@openrift/shared";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "../db/index.js";
import { createMockDb } from "../test/mock-db.js";
import { listsRepo } from "./lists.js";
import type { ListRuleProviders } from "./lists.js";

const LIST = {
  id: "lst-1",
  userId: "u1",
  name: "Wants",
  intent: "wish" as const,
  kind: "card" as const,
  isPublic: false,
  shareToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ENTRY = {
  id: "le-1",
  listId: "lst-1",
  userId: "u1",
  kind: "card" as const,
  cardId: "card-1",
  printingId: null,
  copyId: null,
  quantity: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("listsRepo", () => {
  it("listForUser returns lists", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.listForUser("u1")).toEqual([LIST]);
  });

  it("listForUser filters by intent when given", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.listForUser("u1", "wish")).toEqual([LIST]);
  });

  it("getByIdForUser returns a list", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.getByIdForUser("lst-1", "u1")).toEqual(LIST);
  });

  it("getIdKindIntent returns id + kind + intent when owned", async () => {
    const db = createMockDb([{ id: "lst-1", kind: "card", intent: "wish" }]);
    const repo = listsRepo(db);
    expect(await repo.getIdKindIntent("lst-1", "u1")).toEqual({
      id: "lst-1",
      kind: "card",
      intent: "wish",
    });
  });

  it("create returns the created list", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    const result = await repo.create({ userId: "u1", name: "Wants", intent: "wish", kind: "card" });
    expect(result).toEqual(LIST);
  });

  it("update returns the updated list", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.update("lst-1", "u1", { name: "Renamed" })).toEqual(LIST);
  });

  it("deleteByIdForUser returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const repo = listsRepo(db);
    const result = await repo.deleteByIdForUser("lst-1", "u1");
    expect(result).toEqual({ numDeletedRows: 1n });
  });

  it("listMembershipsForCopies short-circuits on empty input without hitting the db", async () => {
    const db = createMockDb([{ listId: "should-not-appear", listName: "x", copyId: "c" }]);
    const repo = listsRepo(db);
    expect(await repo.listMembershipsForCopies([], "u1")).toEqual({
      lists: [],
      copiesOnAnyList: 0,
    });
  });

  it("listMembershipsForCopies counts distinct copies per list and overall, busiest first", async () => {
    // copy-1 sits on both lists; copy-2 only on Trades. Distinct counting must
    // not double-count copy-1 across lists, and copiesOnAnyList is the union.
    const db = createMockDb([
      { listId: "lst-trades", listName: "Trades", copyId: "copy-1" },
      { listId: "lst-trades", listName: "Trades", copyId: "copy-2" },
      { listId: "lst-binder", listName: "Binder", copyId: "copy-1" },
    ]);
    const repo = listsRepo(db);
    expect(await repo.listMembershipsForCopies(["copy-1", "copy-2"], "u1")).toEqual({
      lists: [
        { id: "lst-trades", name: "Trades", copyCount: 2 },
        { id: "lst-binder", name: "Binder", copyCount: 1 },
      ],
      copiesOnAnyList: 2,
    });
  });

  it("listMembershipsForCopies aggregates correctly when an excludeListId is passed", async () => {
    // The originating list is excluded at the SQL layer (verified by the
    // integration suite — the mock db ignores WHERE), so the repo only ever
    // sees the remaining rows. This guards the param plumbing + aggregation.
    const db = createMockDb([{ listId: "lst-binder", listName: "Binder", copyId: "copy-1" }]);
    const repo = listsRepo(db);
    expect(await repo.listMembershipsForCopies(["copy-1"], "u1", "lst-trades")).toEqual({
      lists: [{ id: "lst-binder", name: "Binder", copyCount: 1 }],
      copiesOnAnyList: 1,
    });
  });

  it("listMembershipsForCopies returns empty when no list references the copies", async () => {
    const db = createMockDb([]);
    const repo = listsRepo(db);
    expect(await repo.listMembershipsForCopies(["copy-1"], "u1")).toEqual({
      lists: [],
      copiesOnAnyList: 0,
    });
  });

  it("setShareToken sets a token + isPublic=true", async () => {
    const shared = { ...LIST, isPublic: true, shareToken: "tok-abc" };
    const db = createMockDb([shared]);
    const repo = listsRepo(db);
    expect(await repo.setShareToken("lst-1", "u1", "tok-abc", true)).toEqual(shared);
  });

  it("setShareToken nulls the token + isPublic=false on unshare", async () => {
    const db = createMockDb([LIST]);
    const repo = listsRepo(db);
    expect(await repo.setShareToken("lst-1", "u1", null, false)).toEqual(LIST);
  });

  it("findByShareToken returns list + owner name", async () => {
    const db = createMockDb([{ ...LIST, ownerName: "Friend" }]);
    const repo = listsRepo(db);
    const found = await repo.findByShareToken("tok-abc");
    expect(found?.list.id).toBe("lst-1");
    expect(found?.ownerName).toBe("Friend");
  });

  it("findByShareToken returns undefined when token is unknown", async () => {
    const db = createMockDb([]);
    const repo = listsRepo(db);
    expect(await repo.findByShareToken("nope")).toBeUndefined();
  });

  it("entriesWithDetails dispatches to the card-kind query", async () => {
    const enriched = [
      {
        id: "le-1",
        listId: "lst-1",
        cardId: "card-1",
        quantity: 1,
        cardName: "Fire Dragon",
      },
    ];
    const db = createMockDb(enriched);
    const repo = listsRepo(db);
    const rows = await repo.entriesWithDetails("lst-1", "card", "u1");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.cardName).toBe("Fire Dragon");
    // The card-kind query produces the card variant — no printing/copy fields.
    expect(row?.kind).toBe("card");
    if (row?.kind === "card") {
      expect(row.cardId).toBe("card-1");
    }
    expect("setId" in (row ?? {})).toBe(false);
    expect("printingId" in (row ?? {})).toBe(false);
  });

  it("entriesWithDetailsAnon skips user-scoping", async () => {
    const db = createMockDb([]);
    const repo = listsRepo(db);
    expect(await repo.entriesWithDetailsAnon("lst-1", "card")).toEqual([]);
  });

  it("createEntry returns the created entry", async () => {
    const db = createMockDb([ENTRY]);
    const repo = listsRepo(db);
    const result = await repo.createEntry({
      listId: "lst-1",
      userId: "u1",
      kind: "card",
      cardId: "card-1",
      printingId: null,
      copyId: null,
      quantity: 1,
    });
    expect(result).toEqual(ENTRY);
  });

  it("bulkCreateEntries returns zero counts for empty input without hitting the db", async () => {
    const db = createMockDb([{ id: "should-not-appear" }]);
    const repo = listsRepo(db);
    expect(await repo.bulkCreateEntries("card", [])).toEqual({ inserted: 0, updated: 0 });
  });

  it("bulkCreateEntries counts inserted vs. updated rows from the xmax marker", async () => {
    // The .returning(xmax = 0) marker distinguishes brand-new rows (true)
    // from rows merged into via ON CONFLICT DO UPDATE (false).
    const db = createMockDb([{ inserted: true }, { inserted: false }, { inserted: true }]);
    const repo = listsRepo(db);
    const result = await repo.bulkCreateEntries("card", [
      {
        listId: "lst-1",
        userId: "u1",
        kind: "card",
        cardId: "card-1",
        printingId: null,
        copyId: null,
        quantity: 1,
      },
      {
        listId: "lst-1",
        userId: "u1",
        kind: "card",
        cardId: "card-2",
        printingId: null,
        copyId: null,
        quantity: 1,
      },
      {
        listId: "lst-1",
        userId: "u1",
        kind: "card",
        cardId: "card-3",
        printingId: null,
        copyId: null,
        quantity: 1,
      },
    ]);
    expect(result).toEqual({ inserted: 2, updated: 1 });
  });

  it("bulkCreateEntriesFromCopies returns zero counts for empty input", async () => {
    const db = createMockDb([{ id: "should-not-appear" }]);
    const repo = listsRepo(db);
    expect(await repo.bulkCreateEntriesFromCopies("lst-1", "card", "u1", [], false)).toEqual({
      added: 0,
      updated: 0,
      skipped: 0,
    });
  });

  it("bulkCreateEntriesFromCopies skips all when no owned copies are returned", async () => {
    // Returning an empty array from the SELECT means none of the copy IDs
    // belonged to the user; everything is reported as skipped.
    const db = createMockDb([]);
    const repo = listsRepo(db);
    expect(
      await repo.bulkCreateEntriesFromCopies("lst-1", "card", "u1", ["c1", "c2"], false),
    ).toEqual({
      added: 0,
      updated: 0,
      skipped: 2,
    });
  });

  it("updateEntry returns the updated entry", async () => {
    const updated = { ...ENTRY, quantity: 5 };
    const db = createMockDb([updated]);
    const repo = listsRepo(db);
    expect(await repo.updateEntry("le-1", "lst-1", "u1", { quantity: 5 })).toEqual(updated);
  });

  it("deleteEntry returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const repo = listsRepo(db);
    expect(await repo.deleteEntry("le-1", "lst-1", "u1")).toEqual({ numDeletedRows: 1n });
  });
});

/**
 * Fake `db` that answers by table, so the two queries `expandedCounts` makes
 * (`lists`, then `listEntries`) get their own canned rows. WHERE clauses are
 * ignored — the canned rows already stand for the filtered result.
 */
function tableDb(rowsByTable: Record<string, Record<string, unknown>[]>): Kysely<Database> {
  function chain(table: string): unknown {
    const handler: ProxyHandler<() => unknown> = {
      get(_target, prop) {
        if (prop === "execute") {
          return () => Promise.resolve(rowsByTable[table] ?? []);
        }
        if (prop === "then" || prop === "catch" || prop === "finally" || typeof prop === "symbol") {
          return undefined;
        }
        return () => chain(table);
      },
      apply() {
        return chain(table);
      },
    };
    return new Proxy(() => chain(table), handler);
  }
  return {
    selectFrom: (arg: string) => chain(arg.split(" ")[0]),
  } as unknown as Kysely<Database>;
}

/**
 * Minimal catalog {@link Printing} for `filterCards`; the empty filter matches
 * every one of these.
 */
function catalogPrinting(id: string, cardId: string): Printing {
  return {
    id,
    cardId,
    shortCode: id,
    setId: "set-1",
    setSlug: "set-alpha",
    setReleased: true,
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "Artist",
    publicCode: "PUB",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card: {
      slug: cardId,
      name: `Card ${cardId}`,
      type: "unit",
      types: ["unit"],
      superTypes: [],
      domains: ["fury"],
      tokenCardIds: [],
      energy: 1,
      might: 1,
      power: 1,
      keywords: [],
      tags: [],
      mightBonus: 0,
      maxCopiesOverride: null,
      errata: null,
      bans: [],
    },
  } as Printing;
}

/** A card-kind wish rule that takes the whole catalog, one copy of each. */
const CATCH_ALL_WISH_RULE = {
  kind: "wish" as const,
  filter: EMPTY_CARD_FILTERS,
  quantity: { mode: "fixed" as const, n: 1 },
  excludeIds: [],
  netOwned: false,
};

const CATALOG = [
  catalogPrinting("prt-1", "crd-1"),
  catalogPrinting("prt-2", "crd-2"),
  catalogPrinting("prt-3", "crd-3"),
];

function ruleListRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "lst-rule",
    kind: "card",
    rules: [CATCH_ALL_WISH_RULE],
    ruleCombine: null,
    userId: "u1",
    ...overrides,
  };
}

function manualEntryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "le-1",
    listId: "lst-rule",
    kind: "card",
    cardId: "crd-1",
    printingId: null,
    copyId: null,
    quantity: 1,
    pricePref: null,
    priceAbsoluteCents: null,
    tradeType: null,
    ...overrides,
  };
}

function countingProviders(catalog: Printing[] = CATALOG) {
  const ownedCopyCalls: string[] = [];
  let catalogCalls = 0;
  let priceCalls = 0;
  let enumCalls = 0;
  const providers: ListRuleProviders = {
    assembleCatalog: () => {
      catalogCalls++;
      return Promise.resolve({ printings: catalog, customTagAssignments: {} });
    },
    ownedCopies: (ownerId) => {
      ownedCopyCalls.push(ownerId);
      return Promise.resolve([]);
    },
    enumOrders: () => {
      enumCalls++;
      return Promise.resolve({ finishes: [], rarities: [], artVariants: [] });
    },
    priceLookup: () => {
      priceCalls++;
      return Promise.resolve(EMPTY_PRICE_LOOKUP);
    },
  };
  return {
    providers,
    ownedCopyCalls,
    counts: () => ({ catalogCalls, priceCalls, enumCalls }),
  };
}

describe("listsRepo.expandedCounts", () => {
  it("counts a rule list's expansion without enriching entries", async () => {
    const { providers } = countingProviders();
    const db = tableDb({ lists: [ruleListRow()], listEntries: [] });
    const counts = await listsRepo(db, providers).expandedCounts(["lst-rule"]);

    // The catch-all rule takes all three catalog cards.
    expect(counts.get("lst-rule")).toBe(3);
  });

  it("merges manual entries with rule output instead of adding them", async () => {
    const { providers } = countingProviders();
    const db = tableDb({
      lists: [ruleListRow()],
      // crd-1 is also produced by the rule (so it must not double-count);
      // crd-9 is outside the catalog, so it only exists manually.
      listEntries: [
        manualEntryRow({ id: "le-1", cardId: "crd-1" }),
        manualEntryRow({ id: "le-2", cardId: "crd-9" }),
      ],
    });
    const counts = await listsRepo(db, providers).expandedCounts(["lst-rule"]);

    // 3 from the rule + the manual-only crd-9; crd-1 is one entry, not two.
    expect(counts.get("lst-rule")).toBe(4);
  });

  it("skips lists that carry no rules, so callers keep the materialized count", async () => {
    const { providers } = countingProviders();
    const db = tableDb({
      lists: [ruleListRow(), ruleListRow({ id: "lst-manual", rules: [] })],
      listEntries: [],
    });
    const counts = await listsRepo(db, providers).expandedCounts(["lst-rule", "lst-manual"]);

    expect(counts.has("lst-rule")).toBe(true);
    expect(counts.has("lst-manual")).toBe(false);
  });

  it("loads owned copies once per owner, not once per list", async () => {
    const tradeRule = {
      kind: "trade" as const,
      filter: EMPTY_CARD_FILTERS,
      keepPerCard: { mode: "fixed" as const, n: 0 },
      collectionIds: null,
      excludeCopyIds: [],
    };
    const { providers, ownedCopyCalls } = countingProviders();
    const db = tableDb({
      lists: [
        ruleListRow({ id: "a", kind: "copy", userId: "u1", rules: [tradeRule] }),
        ruleListRow({ id: "b", kind: "copy", userId: "u1", rules: [tradeRule] }),
        ruleListRow({ id: "c", kind: "copy", userId: "u2", rules: [tradeRule] }),
      ],
      listEntries: [],
    });
    await listsRepo(db, providers).expandedCounts(["a", "b", "c"]);

    // Three lists, two owners, two inventory reads.
    expect(ownedCopyCalls.toSorted()).toEqual(["u1", "u2"]);
  });

  it("assembles the catalog once for the whole batch", async () => {
    const { providers, counts: callCounts } = countingProviders();
    const db = tableDb({
      lists: [ruleListRow({ id: "a" }), ruleListRow({ id: "b" }), ruleListRow({ id: "c" })],
      listEntries: [],
    });
    await listsRepo(db, providers).expandedCounts(["a", "b", "c"]);

    expect(callCounts().catalogCalls).toBe(1);
  });

  it("skips the price and keep-order loads when no rule needs them", async () => {
    const { providers, counts: callCounts, ownedCopyCalls } = countingProviders();
    const db = tableDb({ lists: [ruleListRow()], listEntries: [] });
    await listsRepo(db, providers).expandedCounts(["lst-rule"]);

    // A plain wish rule reads neither prices, keep orders, nor the inventory.
    expect(callCounts().priceCalls).toBe(0);
    expect(callCounts().enumCalls).toBe(0);
    expect(ownedCopyCalls).toEqual([]);
  });

  it("returns an empty map for no ids, and without providers", async () => {
    const { providers } = countingProviders();
    const db = tableDb({ lists: [ruleListRow()], listEntries: [] });

    const noIds = await listsRepo(db, providers).expandedCounts([]);
    expect(noIds.size).toBe(0);
    // No providers wired (a repo built for a manual-only path) must not throw.
    const noProviders = await listsRepo(db).expandedCounts(["lst-rule"]);
    expect(noProviders.size).toBe(0);
  });

  it("returns an empty map when the ids match no list", async () => {
    const { providers } = countingProviders();
    const db = tableDb({ lists: [], listEntries: [] });

    const counts = await listsRepo(db, providers).expandedCounts(["ghost"]);
    expect(counts.size).toBe(0);
  });
});
