import { EMPTY_CARD_FILTERS, EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import type {
  CardFilters,
  KeepPriorityOrders,
  ListRule,
  OwnedCopyRow,
  PriceLookup,
  Printing,
} from "@openrift/shared";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "../db/index.js";
import { gravatarHashForEmail } from "../lib/gravatar.js";
import { friendGroupMatchesRepo } from "./friend-group-matches.js";
import type { ListRuleProviders } from "./lists.js";

// ADR-034 reworked the matcher from a single SQL join to app-level expansion, so
// the old query-shape mock no longer applies. This fake `db` dispatches each
// `selectFrom(table)` to a FIFO queue of canned result sets — the matcher's
// loaders run in a fixed order (trade shares → wish shares → supply entries →
// demand entries → copy meta → users → printing details), so a per-table queue
// deterministically feeds each one. WHERE/JOIN clauses are ignored (the canned
// rows already represent the filtered result). The catalog and owned copies a
// rule needs come from {@link ListRuleProviders}, not `db`.
type Rows = Record<string, unknown>[];

function tableOf(arg: string): string {
  return arg.split(" ")[0];
}

function makeDb(queues: Record<string, Rows[]>): Kysely<Database> {
  const cursors: Record<string, number> = {};
  function chain(table: string): unknown {
    const handler: ProxyHandler<() => unknown> = {
      get(_target, prop) {
        if (prop === "execute") {
          return () => {
            const queue = queues[table] ?? [];
            const index = cursors[table] ?? 0;
            cursors[table] = index + 1;
            return Promise.resolve(queue[index] ?? []);
          };
        }
        if (prop === "then" || prop === "catch" || prop === "finally") {
          return undefined;
        }
        if (typeof prop === "symbol") {
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
    selectFrom: (arg: string) => chain(tableOf(arg)),
  } as unknown as Kysely<Database>;
}

const NOW = new Date("2026-06-01T00:00:00Z");

const EMPTY_KEEP_ORDERS = { finishes: [], rarities: [], artVariants: [] };

const PROVIDERS: ListRuleProviders = {
  assembleCatalog: () => Promise.resolve({ printings: [], customTagAssignments: {} }),
  ownedCopies: () => Promise.resolve([]),
  enumOrders: () => Promise.resolve(EMPTY_KEEP_ORDERS),
  priceLookup: () => Promise.resolve(EMPTY_PRICE_LOOKUP),
};

/**
 * A {@link ListRuleProviders} stub backed by an in-memory catalog and per-owner
 * owned copies — the two things the matcher can't build from the fake `db`.
 * @returns Providers serving the given catalog/owned copies.
 */
function providersWith(opts: {
  catalog: Printing[];
  owned?: Record<string, OwnedCopyRow[]>;
  customTagAssignments?: Record<string, readonly string[]>;
  enumOrders?: KeepPriorityOrders;
  priceLookup?: PriceLookup;
}): ListRuleProviders {
  return {
    assembleCatalog: () =>
      Promise.resolve({
        printings: opts.catalog,
        customTagAssignments: opts.customTagAssignments ?? {},
      }),
    ownedCopies: (ownerId) => Promise.resolve(opts.owned?.[ownerId] ?? []),
    enumOrders: () => Promise.resolve(opts.enumOrders ?? EMPTY_KEEP_ORDERS),
    priceLookup: () => Promise.resolve(opts.priceLookup ?? EMPTY_PRICE_LOOKUP),
  };
}

function filters(overrides: Partial<CardFilters> = {}): CardFilters {
  return { ...EMPTY_CARD_FILTERS, ...overrides };
}

/**
 * Minimal catalog {@link Printing} for `filterCards` (mirrors the shared
 * evaluator's test builder). The empty filter matches all of these.
 * @returns A printing whose card defaults to a normal `unit`.
 */
function makeCatalogPrinting(
  id: string,
  cardId: string,
  overrides: { type?: string; keywords?: string[]; artVariant?: string } = {},
): Printing {
  return {
    id,
    cardId,
    shortCode: id,
    setId: "set-1",
    setSlug: "set-alpha",
    setReleased: true,
    rarity: "common",
    artVariant: overrides.artVariant ?? "normal",
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
      type: overrides.type ?? "unit",
      types: [overrides.type ?? "unit"],
      superTypes: [],
      domains: ["fury"],
      tokenCardIds: [],
      energy: 1,
      might: 1,
      power: 1,
      keywords: overrides.keywords ?? [],
      tags: [],
      mightBonus: 0,
      maxCopiesOverride: null,
      errata: null,
      bans: [],
    },
  } as Printing;
}

function ownedCopy(overrides: Partial<OwnedCopyRow> & { copyId: string }): OwnedCopyRow {
  return {
    printingId: "prt-1",
    cardId: "crd-1",
    collectionId: "col-1",
    reserved: false,
    ...overrides,
  };
}

// ── Row builders for the fake-db queues ─────────────────────────────────────

function tradeShare(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    listId: "lst-t",
    listName: "Binder",
    ownerUserId: "seller",
    kind: "copy",
    sharedAt: NOW,
    defaultPricePref: null,
    defaultPriceAbsoluteCents: null,
    defaultTradeType: null,
    currency: null,
    rules: [],
    ...overrides,
  };
}

function wishShare(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    listId: "lst-w",
    listName: "Wants",
    ownerUserId: "viewer",
    kind: "card",
    sharedAt: NOW,
    defaultPricePref: null,
    defaultPriceAbsoluteCents: null,
    defaultTradeType: null,
    currency: null,
    rules: [],
    ...overrides,
  };
}

function supplyEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e-t",
    listId: "lst-t",
    kind: "copy",
    cardId: null,
    printingId: null,
    copyId: "cp-1",
    quantity: 1,
    pricePref: null,
    priceAbsoluteCents: null,
    tradeType: null,
    createdAt: NOW,
    ...overrides,
  };
}

function demandEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e-w",
    listId: "lst-w",
    kind: "card",
    cardId: "crd-1",
    printingId: null,
    copyId: null,
    quantity: 1,
    pricePref: null,
    priceAbsoluteCents: null,
    tradeType: null,
    createdAt: NOW,
    ...overrides,
  };
}

function copyRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cp-1",
    printingId: "prt-1",
    cardId: "crd-1",
    createdAt: NOW,
    reserved: false,
    loaned: false,
    isAltered: false,
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    ...overrides,
  };
}

function userRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "seller", name: "Alice", image: null, email: "a@x.com", ...overrides };
}

function printingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "prt-1",
    cardName: "Annie, Fiery",
    setId: "set-1",
    rarity: "common",
    finish: "normal",
    imageId: null,
    ...overrides,
  };
}

/**
 * A baseline manual binder (seller) + wishlist (viewer) sharing one card.
 * @returns Per-table FIFO queues for {@link makeDb}.
 */
function baselineQueues(overrides: { reserved?: boolean; copy?: Record<string, unknown> } = {}) {
  return {
    // First call: trade shares. Second call: wish shares.
    friendGroupListShares: [[tradeShare()], [wishShare()]],
    // First call: supply (trade-list) entries. Second: demand (wish-list) entries.
    listEntries: [[supplyEntry()], [demandEntry({ quantity: 2 })]],
    copies: [[copyRow({ reserved: overrides.reserved ?? false, ...overrides.copy })]],
    users: [[userRow()]],
    printings: [[printingRow()]],
  };
}

describe("friendGroupMatchesRepo (ADR-034 app-level matcher)", () => {
  it("matches a manual wish against a manual trade copy", async () => {
    const repo = friendGroupMatchesRepo(makeDb(baselineQueues()), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      counterpartyUserId: "seller",
      counterpartyName: "Alice",
      counterpartyGravatarHash: gravatarHashForEmail("a@x.com"),
      sellEntryId: "e-t",
      copyId: "cp-1",
      printingId: "prt-1",
      cardId: "crd-1",
      cardName: "Annie, Fiery",
      buyEntryId: "e-w",
      buyEntryKind: "card",
      buyQuantity: 2,
    });
  });

  it("excludes copies reserved by a live trade", async () => {
    const repo = friendGroupMatchesRepo(makeDb(baselineQueues({ reserved: true })), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toEqual([]);
  });

  it("excludes altered copies from matching", async () => {
    const repo = friendGroupMatchesRepo(
      makeDb(baselineQueues({ copy: { isAltered: true } })),
      PROVIDERS,
    );
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toEqual([]);
  });

  it("excludes altered copies from the mirror direction too", async () => {
    const queues = baselineQueues({ copy: { isAltered: true } });
    queues.friendGroupListShares[0][0].ownerUserId = "viewer";
    queues.friendGroupListShares[1][0].ownerUserId = "buyer";
    queues.users[0][0] = { id: "buyer", name: "Bob", image: null, email: "b@x.com" };
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersWantYourHaves({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toEqual([]);
  });

  it("surfaces the offered copy's condition and public note on the match row", async () => {
    const repo = friendGroupMatchesRepo(
      makeDb(baselineQueues({ copy: { condition: "near-mint", notesPublic: "corner wear" } })),
      PROVIDERS,
    );
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ condition: "near-mint", notesPublic: "corner wear" });
  });

  it("surfaces the offered copy's grading on the match row", async () => {
    const repo = friendGroupMatchesRepo(
      makeDb(baselineQueues({ copy: { grader: "psa", grade: 9 } })),
      PROVIDERS,
    );
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ condition: null, grader: "psa", grade: 9 });
  });

  it("never matches the viewer with themselves", async () => {
    const queues = baselineQueues();
    queues.friendGroupListShares[0][0].ownerUserId = "viewer";
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toEqual([]);
  });

  it("returns the same shape for othersWantYourHaves (mirror direction)", async () => {
    const queues = baselineQueues();
    queues.friendGroupListShares[0][0].ownerUserId = "viewer"; // viewer's trade list
    queues.friendGroupListShares[1][0].ownerUserId = "buyer"; // other's wish list
    queues.users[0][0] = { id: "buyer", name: "Bob", image: null, email: "b@x.com" };
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersWantYourHaves({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ counterpartyUserId: "buyer", cardId: "crd-1" });
  });

  it("resolves empty trade prefs to an empty EffectiveTradePreference", async () => {
    const repo = friendGroupMatchesRepo(makeDb(baselineQueues()), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows[0]?.sellPref).toMatchObject({ pricePref: null, tradeType: null });
    expect(rows[0]?.buyPref).toMatchObject({ pricePref: null, tradeType: null });
  });
});

describe("friendGroupMatchesRepo — promised-incoming netting", () => {
  // The baseline want is quantity 2 of crd-1 (see baselineQueues). The canned
  // `cardTrades` rows stand for the already-filtered firm promises (reserved,
  // or completed with receiver sync unapplied) — the fake db ignores WHEREs, so
  // the status ladder itself is covered by the integration test.
  function promisedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      receiverUserId: "viewer",
      printingId: "prt-1",
      cardId: "crd-1",
      quantity: 2,
      ...overrides,
    };
  }

  it("drops a want fully covered by a firm incoming trade", async () => {
    const queues = { ...baselineQueues(), cardTrades: [[promisedRow()]] };
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toEqual([]);
  });

  it("keeps the residual want when the promise covers it partially", async () => {
    const queues = { ...baselineQueues(), cardTrades: [[promisedRow({ quantity: 1 })]] };
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ buyEntryId: "e-w", buyQuantity: 1 });
  });

  it("ignores promises made to other members", async () => {
    const queues = {
      ...baselineQueues(),
      cardTrades: [[promisedRow({ receiverUserId: "someone-else" })]],
    };
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ buyQuantity: 2 });
  });

  it("nets a printing-keyed wish from the per-printing pool", async () => {
    const queues = {
      ...baselineQueues(),
      friendGroupListShares: [[tradeShare()], [wishShare({ kind: "printing" })]],
      listEntries: [
        [supplyEntry()],
        [demandEntry({ kind: "printing", cardId: null, printingId: "prt-1", quantity: 1 })],
      ],
      cardTrades: [[promisedRow({ quantity: 1 })]],
    };
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toEqual([]);
  });

  it("spends a promise once across the same want on two lists", async () => {
    // Two wish lists each wanting the same card, one promised copy: only the
    // first list's entry (build order) is covered — the second still
    // advertises. The promise must not net both.
    const queues = {
      ...baselineQueues(),
      friendGroupListShares: [
        [tradeShare()],
        [wishShare({ listId: "lst-w1" }), wishShare({ listId: "lst-w2" })],
      ],
      listEntries: [
        [supplyEntry()],
        [
          demandEntry({ id: "e-w1", listId: "lst-w1", quantity: 1 }),
          demandEntry({ id: "e-w2", listId: "lst-w2", quantity: 1 }),
        ],
      ],
      cardTrades: [[promisedRow({ quantity: 1 })]],
    };
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ buyEntryId: "e-w2", buyQuantity: 1 });
  });

  it("nets the mirror direction's buyer want too", async () => {
    const queues = {
      ...baselineQueues(),
      cardTrades: [[promisedRow({ receiverUserId: "buyer" })]],
    };
    queues.friendGroupListShares[0][0].ownerUserId = "viewer"; // viewer's trade list
    queues.friendGroupListShares[1][0].ownerUserId = "buyer"; // other's wish list
    queues.users[0][0] = { id: "buyer", name: "Bob", image: null, email: "b@x.com" };
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersWantYourHaves({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toEqual([]);
  });
});

describe("friendGroupMatchesRepo — sorting and counterparty scoping", () => {
  // Two sellers (Alice, Bob); the viewer wants both Alpha and Beta.
  function multiSellerQueues() {
    return {
      friendGroupListShares: [
        [
          tradeShare({ listId: "lst-alice", ownerUserId: "alice" }),
          tradeShare({ listId: "lst-bob", ownerUserId: "bob" }),
        ],
        [wishShare({ listId: "lst-w", ownerUserId: "viewer" })],
      ],
      listEntries: [
        [
          supplyEntry({ id: "e-a-beta", listId: "lst-alice", copyId: "cp-a-beta" }),
          supplyEntry({ id: "e-a-alpha", listId: "lst-alice", copyId: "cp-a-alpha" }),
          supplyEntry({ id: "e-b-alpha", listId: "lst-bob", copyId: "cp-b-alpha" }),
        ],
        [
          demandEntry({ id: "e-w-alpha", listId: "lst-w", cardId: "crd-alpha" }),
          demandEntry({ id: "e-w-beta", listId: "lst-w", cardId: "crd-beta" }),
        ],
      ],
      copies: [
        [
          copyRow({ id: "cp-a-beta", printingId: "prt-beta", cardId: "crd-beta" }),
          copyRow({ id: "cp-a-alpha", printingId: "prt-alpha-a", cardId: "crd-alpha" }),
          copyRow({ id: "cp-b-alpha", printingId: "prt-alpha-b", cardId: "crd-alpha" }),
        ],
      ],
      users: [
        [
          userRow({ id: "alice", name: "Alice", email: "alice@x.com" }),
          userRow({ id: "bob", name: "Bob", email: "bob@x.com" }),
        ],
      ],
      printings: [
        [
          printingRow({ id: "prt-beta", cardName: "Beta" }),
          printingRow({ id: "prt-alpha-a", cardName: "Alpha" }),
          printingRow({ id: "prt-alpha-b", cardName: "Alpha" }),
        ],
      ],
    };
  }

  it("sorts by counterparty name, then card name", async () => {
    const repo = friendGroupMatchesRepo(makeDb(multiSellerQueues()), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows.map((row) => `${row.counterpartyName ?? ""}::${row.cardName}`)).toEqual([
      "Alice::Alpha",
      "Alice::Beta",
      "Bob::Alpha",
    ]);
  });

  it("restricts to one counterparty when counterpartyUserId is given", async () => {
    const repo = friendGroupMatchesRepo(makeDb(multiSellerQueues()), PROVIDERS);
    const rows = await repo.othersHaveYourWants({
      groupId: "g",
      viewerUserId: "viewer",
      counterpartyUserId: "bob",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ counterpartyUserId: "bob", cardId: "crd-alpha" });
  });
});

describe("friendGroupMatchesRepo — trade-preference coalescing", () => {
  it("ships resolved sellPref / buyPref through to the match row", async () => {
    const queues = baselineQueues();
    queues.friendGroupListShares[0][0] = tradeShare({
      defaultPricePref: "cm_lowest",
      defaultTradeType: "cards",
      currency: "EUR",
    });
    queues.friendGroupListShares[1][0] = wishShare({
      defaultPricePref: "absolute",
      defaultPriceAbsoluteCents: 400,
      defaultTradeType: "money",
      currency: "USD",
    });
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows[0]?.sellPref).toEqual({
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
      currency: "EUR",
    });
    expect(rows[0]?.buyPref).toEqual({
      pricePref: "absolute",
      priceAbsoluteCents: 400,
      tradeType: "money",
      currency: "USD",
    });
  });

  it("clears priceAbsoluteCents when the resolved pricePref is not 'absolute'", async () => {
    // The list default carries an absolute amount, but the entry override
    // switches the pref to a marketplace preset; the absolute amount must drop.
    const queues = baselineQueues();
    queues.friendGroupListShares[0][0] = tradeShare({
      defaultPricePref: "absolute",
      defaultPriceAbsoluteCents: 250,
      currency: "EUR",
    });
    queues.listEntries[0][0] = supplyEntry({ pricePref: "cm_lowest" });
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows[0]?.sellPref).toMatchObject({ pricePref: "cm_lowest", priceAbsoluteCents: null });
  });
});

describe("friendGroupMatchesRepo — recentIncomingMatchesForFeed", () => {
  it("maps a match to the feed shape with a derived gravatar hash", async () => {
    const queues = baselineQueues();
    queues.listEntries[0][0] = supplyEntry({ createdAt: new Date("2026-06-03T00:00:00Z") });
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.recentIncomingMatchesForFeed({
      groupId: "g",
      viewerUserId: "viewer",
      limit: 10,
    });
    expect(rows).toEqual([
      {
        counterpartyUserId: "seller",
        counterpartyName: "Alice",
        counterpartyImage: null,
        counterpartyGravatarHash: gravatarHashForEmail("a@x.com"),
        printingId: "prt-1",
        cardId: "crd-1",
        matchedAt: new Date("2026-06-03T00:00:00Z"),
      },
    ]);
  });

  it("dedupes by (counterparty, printing), keeping the latest matchedAt", async () => {
    const queues = baselineQueues();
    // Two copies of the SAME printing from the same seller → one feed row.
    queues.listEntries[0] = [
      supplyEntry({ id: "e-t1", copyId: "cp-1", createdAt: new Date("2026-05-01T00:00:00Z") }),
      supplyEntry({ id: "e-t2", copyId: "cp-2", createdAt: new Date("2026-06-02T00:00:00Z") }),
    ];
    queues.copies[0] = [
      copyRow({ id: "cp-1", printingId: "prt-1", cardId: "crd-1" }),
      copyRow({ id: "cp-2", printingId: "prt-1", cardId: "crd-1" }),
    ];
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.recentIncomingMatchesForFeed({
      groupId: "g",
      viewerUserId: "viewer",
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.matchedAt).toEqual(new Date("2026-06-02T00:00:00Z"));
  });

  it("keeps distinct (counterparty, printing) pairs separate, newest first", async () => {
    const queues = baselineQueues();
    queues.listEntries[0] = [
      supplyEntry({ id: "e-a", copyId: "cp-a", createdAt: new Date("2026-06-01T00:00:00Z") }),
      supplyEntry({ id: "e-b", copyId: "cp-b", createdAt: new Date("2026-06-05T00:00:00Z") }),
    ];
    queues.listEntries[1] = [
      demandEntry({ id: "e-w-a", cardId: "crd-a" }),
      demandEntry({ id: "e-w-b", cardId: "crd-b" }),
    ];
    queues.copies[0] = [
      copyRow({ id: "cp-a", printingId: "prt-a", cardId: "crd-a" }),
      copyRow({ id: "cp-b", printingId: "prt-b", cardId: "crd-b" }),
    ];
    queues.printings[0] = [
      printingRow({ id: "prt-a", cardName: "Alpha" }),
      printingRow({ id: "prt-b", cardName: "Beta" }),
    ];
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.recentIncomingMatchesForFeed({
      groupId: "g",
      viewerUserId: "viewer",
      limit: 10,
    });
    expect(rows.map((row) => row.printingId)).toEqual(["prt-b", "prt-a"]);
  });

  it("respects the limit after sorting newest first", async () => {
    const queues = baselineQueues();
    queues.listEntries[0] = [
      supplyEntry({ id: "e1", copyId: "cp-1", createdAt: new Date("2026-06-01T00:00:00Z") }),
      supplyEntry({ id: "e2", copyId: "cp-2", createdAt: new Date("2026-06-02T00:00:00Z") }),
      supplyEntry({ id: "e3", copyId: "cp-3", createdAt: new Date("2026-06-03T00:00:00Z") }),
    ];
    queues.listEntries[1] = [
      demandEntry({ id: "w1", cardId: "crd-1" }),
      demandEntry({ id: "w2", cardId: "crd-2" }),
      demandEntry({ id: "w3", cardId: "crd-3" }),
    ];
    queues.copies[0] = [
      copyRow({ id: "cp-1", printingId: "prt-1", cardId: "crd-1" }),
      copyRow({ id: "cp-2", printingId: "prt-2", cardId: "crd-2" }),
      copyRow({ id: "cp-3", printingId: "prt-3", cardId: "crd-3" }),
    ];
    queues.printings[0] = [
      printingRow({ id: "prt-1", cardName: "One" }),
      printingRow({ id: "prt-2", cardName: "Two" }),
      printingRow({ id: "prt-3", cardName: "Three" }),
    ];
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    const rows = await repo.recentIncomingMatchesForFeed({
      groupId: "g",
      viewerUserId: "viewer",
      limit: 2,
    });
    expect(rows.map((row) => row.printingId)).toEqual(["prt-3", "prt-2"]);
  });
});

describe("friendGroupMatchesRepo — dynamic rules (ADR-034)", () => {
  it("matches a rule-derived wish against a manual trade copy (buyEntryId null)", async () => {
    const queues = {
      friendGroupListShares: [
        [tradeShare({ ownerUserId: "seller" })],
        // Viewer's wish list is rule-driven, no manual entries.
        [
          wishShare({
            ownerUserId: "viewer",
            rules: [
              {
                kind: "wish",
                filter: filters(),
                quantity: { mode: "fixed", n: 1 },
                excludeIds: [],
              },
            ],
          }),
        ],
      ],
      listEntries: [[supplyEntry({ id: "e-t", copyId: "cp-1" })], []],
      copies: [[copyRow({ id: "cp-1", printingId: "prt-1", cardId: "crd-1" })]],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [[printingRow({ id: "prt-1", cardName: "Annie, Fiery" })]],
    };
    const providers = providersWith({ catalog: [makeCatalogPrinting("prt-1", "crd-1")] });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      counterpartyUserId: "seller",
      cardId: "crd-1",
      sellEntryId: "e-t",
      buyEntryId: null, // rule-derived demand has no list_entries row
    });
  });

  it("offers rule-derived trade copies (sellEntryId null) and excludes reserved ones", async () => {
    const queues = {
      friendGroupListShares: [
        // Seller's trade list is rule-driven, no manual entries.
        [
          tradeShare({
            ownerUserId: "seller",
            rules: [
              {
                kind: "trade",
                filter: filters(),
                collectionIds: null,
                keepPerCard: { mode: "fixed", n: 0 },
                excludeCopyIds: [],
              },
            ],
          }),
        ],
        [wishShare({ ownerUserId: "viewer" })],
      ],
      listEntries: [[], [demandEntry({ id: "e-w", cardId: "crd-1" })]],
      // cp-own-2 is reserved by a live trade (per the copies/cardTradeCopies join).
      copies: [
        [
          copyRow({ id: "cp-own-1", printingId: "prt-1", cardId: "crd-1", reserved: false }),
          copyRow({ id: "cp-own-2", printingId: "prt-1", cardId: "crd-1", reserved: true }),
        ],
      ],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [[printingRow({ id: "prt-1", cardName: "Annie, Fiery" })]],
    };
    const providers = providersWith({
      catalog: [makeCatalogPrinting("prt-1", "crd-1")],
      owned: {
        seller: [
          ownedCopy({ copyId: "cp-own-1", printingId: "prt-1", cardId: "crd-1" }),
          ownedCopy({ copyId: "cp-own-2", printingId: "prt-1", cardId: "crd-1", reserved: true }),
        ],
      },
    });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      copyId: "cp-own-1",
      sellEntryId: null, // rule-derived supply has no list_entries row
      buyEntryId: "e-w",
      cardId: "crd-1",
    });
  });

  it("applies a trade rule's price bound through the providers' price lookup", async () => {
    // Seller auto-offers everything worth at least 5 on Cardmarket. prt-1
    // quotes 7 (offered), prt-2 quotes 2 (kept), prt-3 has no price (skipped).
    const priceLookup: PriceLookup = {
      get: (printingId, marketplace) =>
        marketplace === "cardmarket" ? { "prt-1": 7, "prt-2": 2 }[printingId] : undefined,
      has: (printingId) => printingId === "prt-1" || printingId === "prt-2",
    };
    const queues = {
      friendGroupListShares: [
        [
          tradeShare({
            ownerUserId: "seller",
            rules: [
              {
                kind: "trade",
                filter: filters({ price: { min: 5, max: null } }),
                priceMarketplace: "cardmarket",
                collectionIds: null,
                keepPerCard: { mode: "fixed", n: 0 },
                excludeCopyIds: [],
              },
            ],
          }),
        ],
        [wishShare({ ownerUserId: "viewer" })],
      ],
      // The viewer wants all three cards, so only the price bound decides
      // which of the seller's copies surface as matches.
      listEntries: [
        [],
        [
          demandEntry({ id: "e-w1", cardId: "crd-1" }),
          demandEntry({ id: "e-w2", cardId: "crd-2" }),
          demandEntry({ id: "e-w3", cardId: "crd-3" }),
        ],
      ],
      copies: [
        [
          copyRow({ id: "cp-own-1", printingId: "prt-1", cardId: "crd-1" }),
          copyRow({ id: "cp-own-2", printingId: "prt-2", cardId: "crd-2" }),
          copyRow({ id: "cp-own-3", printingId: "prt-3", cardId: "crd-3" }),
        ],
      ],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [
        [
          printingRow({ id: "prt-1", cardName: "Annie, Fiery" }),
          printingRow({ id: "prt-2", cardName: "Braum, Steadfast" }),
          printingRow({ id: "prt-3", cardName: "Caitlyn, Precise" }),
        ],
      ],
    };
    const providers = providersWith({
      catalog: [
        makeCatalogPrinting("prt-1", "crd-1"),
        makeCatalogPrinting("prt-2", "crd-2"),
        makeCatalogPrinting("prt-3", "crd-3"),
      ],
      owned: {
        seller: [
          ownedCopy({ copyId: "cp-own-1", printingId: "prt-1", cardId: "crd-1" }),
          ownedCopy({ copyId: "cp-own-2", printingId: "prt-2", cardId: "crd-2" }),
          ownedCopy({ copyId: "cp-own-3", printingId: "prt-3", cardId: "crd-3" }),
        ],
      },
      priceLookup,
    });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ copyId: "cp-own-1", cardId: "crd-1" });
  });

  it("nets owned copies out of a netOwned wish rule (cards at target produce no demand)", async () => {
    const queues = {
      friendGroupListShares: [
        [tradeShare({ ownerUserId: "seller" })],
        [
          wishShare({
            ownerUserId: "viewer",
            rules: [
              {
                kind: "wish",
                filter: filters(),
                quantity: { mode: "playset", multiplier: 1 },
                excludeIds: [],
                netOwned: true,
              },
            ],
          }),
        ],
      ],
      // Seller offers a copy of each card.
      listEntries: [
        [
          supplyEntry({ id: "e-s1", copyId: "cp-s1" }),
          supplyEntry({ id: "e-s2", copyId: "cp-s2" }),
        ],
        [],
      ],
      copies: [
        [
          copyRow({ id: "cp-s1", printingId: "prt-1", cardId: "crd-1" }),
          copyRow({ id: "cp-s2", printingId: "prt-2", cardId: "crd-2" }),
        ],
      ],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [
        [
          printingRow({ id: "prt-1", cardName: "Annie" }),
          printingRow({ id: "prt-2", cardName: "Lux" }),
        ],
      ],
    };
    const providers = providersWith({
      catalog: [
        makeCatalogPrinting("prt-1", "crd-1"), // unit → playset 3
        makeCatalogPrinting("prt-2", "crd-2", { type: "legend" }), // legend → playset 1
      ],
      // Viewer already owns a full playset of crd-1 → netted to zero demand.
      owned: {
        viewer: [1, 2, 3].map((index) =>
          ownedCopy({ copyId: `o${index}`, printingId: "prt-1", cardId: "crd-1" }),
        ),
      },
    });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cardId: "crd-2", copyId: "cp-s2" });
  });

  it("a rule-produced card want only matches printings its filters accept", async () => {
    const queues = {
      friendGroupListShares: [
        [tradeShare({ ownerUserId: "seller" })],
        [
          wishShare({
            ownerUserId: "viewer",
            rules: [
              {
                kind: "wish",
                filter: filters({ artVariantsExclude: ["overnumbered"] }),
                quantity: { mode: "fixed", n: 3 },
                excludeIds: [],
              },
            ],
          }),
        ],
      ],
      // The seller offers a normal-art copy and an overnumbered copy of the
      // same card; only the normal-art one may satisfy the filtered want.
      listEntries: [
        [supplyEntry({ id: "e-s1", copyId: "cp-1" }), supplyEntry({ id: "e-s2", copyId: "cp-2" })],
        [],
      ],
      copies: [
        [
          copyRow({ id: "cp-1", printingId: "prt-1", cardId: "crd-1" }),
          copyRow({ id: "cp-2", printingId: "prt-2", cardId: "crd-1" }),
        ],
      ],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [
        [
          printingRow({ id: "prt-1", cardName: "Annie, Fiery" }),
          printingRow({ id: "prt-2", cardName: "Annie, Fiery" }),
        ],
      ],
    };
    const providers = providersWith({
      catalog: [
        makeCatalogPrinting("prt-1", "crd-1"),
        makeCatalogPrinting("prt-2", "crd-1", { artVariant: "overnumbered" }),
      ],
    });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ copyId: "cp-1", printingId: "prt-1", buyEntryId: null });
  });

  it("owned copies outside a netOwned rule's filters don't fill the want", async () => {
    const queues = {
      friendGroupListShares: [
        [tradeShare({ ownerUserId: "seller" })],
        [
          wishShare({
            ownerUserId: "viewer",
            rules: [
              {
                kind: "wish",
                filter: filters({ artVariantsExclude: ["overnumbered"] }),
                quantity: { mode: "playset", multiplier: 1 },
                excludeIds: [],
                netOwned: true,
              },
            ],
          }),
        ],
      ],
      listEntries: [[supplyEntry({ id: "e-s1", copyId: "cp-1" })], []],
      copies: [[copyRow({ id: "cp-1", printingId: "prt-1", cardId: "crd-1" })]],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [[printingRow({ id: "prt-1", cardName: "Annie, Fiery" })]],
    };
    const providers = providersWith({
      catalog: [
        makeCatalogPrinting("prt-1", "crd-1"),
        makeCatalogPrinting("prt-2", "crd-1", { artVariant: "overnumbered" }),
      ],
      // The viewer owns a full playset, but only in the excluded overnumbered
      // variant — the want must survive netting and still match.
      owned: {
        viewer: [1, 2, 3].map((index) =>
          ownedCopy({ copyId: `o${index}`, printingId: "prt-2", cardId: "crd-1" }),
        ),
      },
    });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ copyId: "cp-1", cardId: "crd-1", buyQuantity: 3 });
  });

  it("unions a manual wish entry with a rule wish entry on the same list", async () => {
    const queues = {
      friendGroupListShares: [
        [tradeShare({ ownerUserId: "seller" })],
        [
          wishShare({
            ownerUserId: "viewer",
            // Rule wants everything except crd-1 (which is covered manually).
            rules: [
              {
                kind: "wish",
                filter: filters(),
                quantity: { mode: "fixed", n: 1 },
                excludeIds: ["crd-1"],
              },
            ],
          }),
        ],
      ],
      listEntries: [
        [
          supplyEntry({ id: "e-s1", copyId: "cp-s1" }),
          supplyEntry({ id: "e-s2", copyId: "cp-s2" }),
        ],
        [demandEntry({ id: "e-w1", cardId: "crd-1" })],
      ],
      copies: [
        [
          copyRow({ id: "cp-s1", printingId: "prt-1", cardId: "crd-1" }),
          copyRow({ id: "cp-s2", printingId: "prt-2", cardId: "crd-2" }),
        ],
      ],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [
        [
          printingRow({ id: "prt-1", cardName: "Annie" }),
          printingRow({ id: "prt-2", cardName: "Lux" }),
        ],
      ],
    };
    const providers = providersWith({
      catalog: [makeCatalogPrinting("prt-1", "crd-1"), makeCatalogPrinting("prt-2", "crd-2")],
    });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.cardId === "crd-1")).toMatchObject({ buyEntryId: "e-w1" });
    expect(rows.find((row) => row.cardId === "crd-2")).toMatchObject({ buyEntryId: null });
  });

  it("scopes a trade rule to its collectionIds (offers only in-scope copies)", async () => {
    const queues = {
      friendGroupListShares: [
        [
          tradeShare({
            ownerUserId: "seller",
            rules: [
              {
                kind: "trade",
                filter: filters(),
                collectionIds: ["col-1"],
                keepPerCard: { mode: "fixed", n: 0 },
                excludeCopyIds: [],
              },
            ],
          }),
        ],
        [wishShare({ ownerUserId: "viewer" })],
      ],
      listEntries: [[], [demandEntry({ id: "e-w", cardId: "crd-1" })]],
      // Copy meta is available for BOTH copies, so a scoping regression (offering
      // the col-2 copy too) would surface as a second match rather than being
      // masked by missing meta.
      copies: [
        [
          copyRow({ id: "cp-col1", printingId: "prt-1", cardId: "crd-1" }),
          copyRow({ id: "cp-col2", printingId: "prt-1", cardId: "crd-1" }),
        ],
      ],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [[printingRow({ id: "prt-1", cardName: "Annie" })]],
    };
    const providers = providersWith({
      catalog: [makeCatalogPrinting("prt-1", "crd-1")],
      owned: {
        seller: [
          ownedCopy({
            copyId: "cp-col1",
            printingId: "prt-1",
            cardId: "crd-1",
            collectionId: "col-1",
          }),
          ownedCopy({
            copyId: "cp-col2",
            printingId: "prt-1",
            cardId: "crd-1",
            collectionId: "col-2",
          }),
        ],
      },
    });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows.map((row) => row.copyId)).toEqual(["cp-col1"]);
  });

  it("adds a manual wish quantity to an overlapping rule wish on the same card", async () => {
    const queues = {
      friendGroupListShares: [
        [tradeShare({ ownerUserId: "seller" })],
        [
          wishShare({
            ownerUserId: "viewer",
            // Rule also wants crd-1, overlapping the manual entry below.
            rules: [
              {
                kind: "wish",
                filter: filters(),
                quantity: { mode: "fixed", n: 1 },
                excludeIds: [],
              },
            ],
          }),
        ],
      ],
      listEntries: [
        [supplyEntry({ id: "e-s1", copyId: "cp-s1" })],
        [demandEntry({ id: "e-w1", cardId: "crd-1", quantity: 1 })],
      ],
      copies: [[copyRow({ id: "cp-s1", printingId: "prt-1", cardId: "crd-1" })]],
      users: [[userRow({ id: "seller", name: "Alice", email: "a@x.com" })]],
      printings: [[printingRow({ id: "prt-1", cardName: "Annie" })]],
    };
    const providers = providersWith({ catalog: [makeCatalogPrinting("prt-1", "crd-1")] });
    const repo = friendGroupMatchesRepo(makeDb(queues), providers);
    const rows = await repo.othersHaveYourWants({ groupId: "g", viewerUserId: "viewer" });
    expect(rows).toHaveLength(1);
    // Manual 1 + rule 1 = 2 (ADR-034 additive merge); the manual entry keeps its id.
    expect(rows[0]).toMatchObject({ cardId: "crd-1", buyEntryId: "e-w1", buyQuantity: 2 });
  });
});

describe("giverPrintingSupply", () => {
  /** @returns Queues for one giver trade list offering one copy of prt-1. */
  function giverQueues(copy: Record<string, unknown> = {}) {
    return {
      friendGroupListShares: [[tradeShare({ ownerUserId: "giver" })]],
      listEntries: [[supplyEntry()]],
      copies: [[copyRow(copy)]],
    };
  }
  const scope = { groupId: "g", giverUserId: "giver", printingId: "prt-1" };

  it("counts an offered clean copy as reservable and as a basis", async () => {
    const repo = friendGroupMatchesRepo(makeDb(giverQueues()), PROVIDERS);
    expect(await repo.giverPrintingSupply(scope)).toEqual({
      unreservedCopyIds: ["cp-1"],
      hasAny: true,
    });
  });

  it("keeps hasAny true for a reserved copy (stack exhausted, not vanished)", async () => {
    const repo = friendGroupMatchesRepo(makeDb(giverQueues({ reserved: true })), PROVIDERS);
    expect(await repo.giverPrintingSupply(scope)).toEqual({
      unreservedCopyIds: [],
      hasAny: true,
    });
  });

  it("treats an altered copy as no basis at all (not reservable, hasAny false)", async () => {
    const repo = friendGroupMatchesRepo(makeDb(giverQueues({ isAltered: true })), PROVIDERS);
    expect(await repo.giverPrintingSupply(scope)).toEqual({
      unreservedCopyIds: [],
      hasAny: false,
    });
  });
});

describe("tradelistHoldersForCard (Discord bot lookup)", () => {
  const scope = { groupId: "g", cardId: "crd-1" };

  /**
   * Two sellers offering the card manually: Alice with two copies, Bob with
   * one. Queue order for the resolver: trade shares → entries → copy meta →
   * users.
   * @returns Per-table FIFO queues for {@link makeDb}.
   */
  function holderQueues() {
    return {
      friendGroupListShares: [
        [
          tradeShare(),
          tradeShare({ listId: "lst-t2", listName: "Bob's binder", ownerUserId: "bob" }),
        ],
      ],
      listEntries: [
        [
          supplyEntry(),
          supplyEntry({ id: "e-t2", copyId: "cp-2" }),
          supplyEntry({ id: "e-t3", listId: "lst-t2", copyId: "cp-3" }),
        ],
      ],
      copies: [[copyRow(), copyRow({ id: "cp-2" }), copyRow({ id: "cp-3" })]],
      users: [[userRow(), userRow({ id: "bob", name: "Bob", email: "b@x.com" })]],
    };
  }

  it("aggregates copies per owner, most copies first", async () => {
    const repo = friendGroupMatchesRepo(makeDb(holderQueues()), PROVIDERS);
    expect(await repo.tradelistHoldersForCard(scope)).toEqual([
      {
        userId: "seller",
        userName: "Alice",
        quantity: 2,
        printings: [{ printingId: "prt-1", quantity: 2, listNames: ["Binder"] }],
      },
      {
        userId: "bob",
        userName: "Bob",
        quantity: 1,
        printings: [{ printingId: "prt-1", quantity: 1, listNames: ["Bob's binder"] }],
      },
    ]);
  });

  it("splits an owner's copies by printing, most copies first", async () => {
    const queues = holderQueues();
    queues.friendGroupListShares = [
      [tradeShare(), tradeShare({ listId: "lst-t2", listName: "Trades" })],
    ];
    queues.listEntries = [
      [
        supplyEntry(),
        supplyEntry({ id: "e-t2", copyId: "cp-2" }),
        supplyEntry({ id: "e-t3", listId: "lst-t2", copyId: "cp-3" }),
      ],
    ];
    // cp-3 is the alt art, and it sits on the second list.
    queues.copies = [
      [copyRow(), copyRow({ id: "cp-2" }), copyRow({ id: "cp-3", printingId: "prt-2" })],
    ];
    queues.users = [[userRow()]];
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    expect(await repo.tradelistHoldersForCard(scope)).toEqual([
      {
        userId: "seller",
        userName: "Alice",
        quantity: 3,
        printings: [
          { printingId: "prt-1", quantity: 2, listNames: ["Binder"] },
          { printingId: "prt-2", quantity: 1, listNames: ["Trades"] },
        ],
      },
    ]);
  });

  it("applies the supply exclusions (reserved, loaned, altered)", async () => {
    const queues = holderQueues();
    queues.copies = [
      [
        copyRow({ reserved: true }),
        copyRow({ id: "cp-2", loaned: true }),
        copyRow({ id: "cp-3", isAltered: true }),
      ],
    ];
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    expect(await repo.tradelistHoldersForCard(scope)).toEqual([]);
  });

  it("ignores copies of other cards", async () => {
    const queues = holderQueues();
    queues.copies = [
      [
        copyRow(),
        copyRow({ id: "cp-2", cardId: "crd-2" }),
        copyRow({ id: "cp-3", cardId: "crd-2" }),
      ],
    ];
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    expect(await repo.tradelistHoldersForCard(scope)).toEqual([
      {
        userId: "seller",
        userName: "Alice",
        quantity: 1,
        printings: [{ printingId: "prt-1", quantity: 1, listNames: ["Binder"] }],
      },
    ]);
  });

  it("counts a copy shared via two lists once, naming both lists", async () => {
    const queues = holderQueues();
    queues.friendGroupListShares = [
      [tradeShare(), tradeShare({ listId: "lst-t2", listName: "Dupes" })],
    ];
    queues.listEntries = [[supplyEntry(), supplyEntry({ id: "e-dup", listId: "lst-t2" })]];
    queues.copies = [[copyRow()]];
    queues.users = [[userRow()]];
    const repo = friendGroupMatchesRepo(makeDb(queues), PROVIDERS);
    expect(await repo.tradelistHoldersForCard(scope)).toEqual([
      {
        userId: "seller",
        userName: "Alice",
        quantity: 1,
        printings: [{ printingId: "prt-1", quantity: 1, listNames: ["Binder", "Dupes"] }],
      },
    ]);
  });
});

// Keep the rule fixtures honest against the schema (a typo'd rule would silently
// produce no entries and pass with `toHaveLength(0)` elsewhere).
const _typecheckRules: ListRule[] = [
  { kind: "wish", filter: filters(), quantity: { mode: "fixed", n: 1 }, excludeIds: [] },
  {
    kind: "trade",
    filter: filters(),
    collectionIds: null,
    keepPerCard: { mode: "fixed", n: 0 },
    excludeCopyIds: [],
  },
];
void _typecheckRules;
