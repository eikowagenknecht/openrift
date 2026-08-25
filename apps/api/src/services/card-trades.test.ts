import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { CardTradeDtoRow } from "../lib/card-trade-presenters.js";
import type { LiveCardTrade } from "../repositories/card-trades.js";
import {
  acceptTrade,
  autoCancelUnfillablePendingTrades,
  createTrade,
  listTradeCopyOptions,
  setTradeQuantity,
} from "./card-trades.js";

function mockTransact(trxRepos: Repos): Transact {
  return (fn) => fn(trxRepos) as any;
}

const TRADE = {
  id: "trade-1",
  groupId: "group-1",
  giverUserId: "giver-1",
  receiverUserId: "receiver-1",
  // The initiator can't accept their own trade (assertRecipient) — make the
  // giver the initiator so the receiver, who calls acceptTrade below, is the
  // eligible recipient.
  initiator: "giver",
  printingId: "printing-1",
  quantity: 1,
  status: "pending",
} as unknown as LiveCardTrade;

/** What the mutations reload through the presenter; no test reads past the id. */
const DTO_ROW: CardTradeDtoRow = {
  id: TRADE.id,
  groupId: "group-1",
  groupSlug: "summoner-skirmish",
  groupLiveName: "Summoner Skirmish",
  groupSnapshotName: null,
  giverUserId: "giver-1",
  receiverUserId: "receiver-1",
  initiator: "giver",
  printingId: "printing-1",
  cardId: "card-1",
  quantity: 1,
  status: "pending",
  giverSyncAppliedAt: null,
  receiverSyncAppliedAt: null,
  createdAt: new Date("2026-03-17T00:00:00.000Z"),
  updatedAt: new Date("2026-03-17T00:00:00.000Z"),
  acceptedAt: null,
  completedAt: null,
  closedAt: null,
  expiresAt: null,
  giverName: "Ekko",
  giverImage: null,
  giverEmail: "ekko@example.com",
  giverSnapshotName: null,
  receiverName: "Jinx",
  receiverImage: null,
  receiverEmail: "jinx@example.com",
  receiverSnapshotName: null,
  counterpartyContacts: [],
};

describe("acceptTrade cross-claim with a concurrent loan", () => {
  it("409s and never pins when the locked copy was pinned to a loan after the supply read", async () => {
    const pinCopies = vi.fn(async () => undefined);
    const markReserved = vi.fn(async () => 1);
    const repos = {
      cardTrades: {
        getById: vi.fn(async () => TRADE),
        pinCopies,
        markReserved,
      },
      friendGroupMatches: {
        // Pre-check reports the copy as unreserved...
        giverPrintingSupply: vi.fn(async () => ({
          unreservedCopyIds: ["copy-1"],
          hasAny: true,
        })),
      },
      copies: {
        lockByIds: vi.fn(async (ids: string[]) => ids),
      },
      loans: {
        // ...but by the time the row is locked, a concurrent createLoan has
        // already pinned it.
        filterLoanedCopyIds: vi.fn(async () => ["copy-1"]),
      },
    } as unknown as Repos;

    const result = await acceptTrade(mockTransact(repos), TRADE.id, TRADE.receiverUserId).catch(
      (error: unknown) => error,
    );

    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).status).toBe(409);
    expect(pinCopies).not.toHaveBeenCalled();
    expect(markReserved).not.toHaveBeenCalled();
  });
});

const GROUP = { id: "group-1", slug: "summoner-skirmish" };

const MATCH_ROW = {
  printingId: "printing-1",
  buyEntryId: "wish-1",
  cardId: "card-1",
  buyQuantity: 3,
};

const OFFER = {
  ...TRADE,
  id: "offer-1",
  quantity: 1,
  receiverWishEntryId: "wish-1",
} as unknown as LiveCardTrade;

/** Rows as `listPendingForGiverPrinting` returns them: oldest first, which the sweep relies on. */
interface Pending {
  id: string;
  groupId: string;
  quantity: number;
  initiator: "giver" | "receiver";
}

/**
 * `supplyByGroup` is the giver's unreserved copies per group; `pending` stands
 * in for the giver's other live trades across every group.
 */
function supplyRepos(supplyByGroup: Record<string, string[]>, pending: Pending[] = []) {
  const listPendingForGiverPrinting = vi.fn(async () => pending);
  const giverPrintingSupply = vi.fn(async ({ groupId }: { groupId: string }) => {
    const copies = supplyByGroup[groupId] ?? [];
    return { unreservedCopyIds: copies, hasAny: copies.length > 0 };
  });
  const create = vi.fn(async () => ({ id: "trade-new" }) as unknown as LiveCardTrade);
  const setPendingQuantity = vi.fn(async () => 1);
  const repos = {
    friendGroups: {
      getBySlugOrPrevious: vi.fn(async () => GROUP),
      getMembership: vi.fn(async () => ({ role: "member" })),
    },
    friendGroupMatches: {
      othersHaveYourWants: vi.fn(async () => [MATCH_ROW]),
      othersWantYourHaves: vi.fn(async () => [MATCH_ROW]),
      giverPrintingSupply,
    },
    cardTrades: {
      findLiveTrade: vi.fn(async () => undefined),
      listPendingForGiverPrinting,
      create,
      setPendingQuantity,
      getById: vi.fn(async () => OFFER),
      getDtoRowByIdForUser: vi.fn(async () => ({ ...DTO_ROW, id: "trade-new" })),
    },
    lists: {
      raiseEntryQuantityTo: vi.fn(async () => undefined),
    },
  } as unknown as Repos;
  return { repos, listPendingForGiverPrinting, giverPrintingSupply, create, setPendingQuantity };
}

function runCreate(repos: Repos, role: "giver" | "receiver", quantity: number): Promise<unknown> {
  return createTrade(repos, {
    callerUserId: role === "giver" ? "giver-1" : "receiver-1",
    groupSlug: GROUP.slug,
    counterpartyUserId: role === "giver" ? "receiver-1" : "giver-1",
    role,
    printingId: MATCH_ROW.printingId,
    quantity,
  }).catch((error: unknown) => error);
}

describe("createTrade supply accounting", () => {
  it("refuses a second offer of the giver's only copy", async () => {
    // One unreserved copy, already claimed by a pending offer to someone else.
    const { repos, create } = supplyRepos({ [GROUP.id]: ["copy-1"] }, [
      { id: "existing-offer", groupId: GROUP.id, quantity: 1, initiator: "giver" },
    ]);

    const result = await runCreate(repos, "giver", 1);

    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).status).toBe(409);
    expect((result as AppError).message).toBe("Only 0 copies are still available");
    expect(create).not.toHaveBeenCalled();
  });

  it("reports the netted available count, not the raw copy count", async () => {
    // Three copies, two of them already claimed by a pending offer.
    const { repos } = supplyRepos({ [GROUP.id]: ["copy-1", "copy-2", "copy-3"] }, [
      { id: "existing-offer", groupId: GROUP.id, quantity: 2, initiator: "giver" },
    ]);

    const result = await runCreate(repos, "giver", 2);

    expect((result as AppError).message).toBe("Only 1 copy is still available");
  });

  it("reads the giver's pending trades across every group, not just the caller's", async () => {
    // No pending offers anywhere, so nothing competes with this one.
    const { repos, listPendingForGiverPrinting, create } = supplyRepos({
      [GROUP.id]: ["copy-1"],
    });

    await runCreate(repos, "giver", 1);

    // The read isn't scoped to the caller's group: it's the giver's whole
    // pending list, which `readSupplyByGroup` then splits out per group.
    expect(listPendingForGiverPrinting).toHaveBeenCalledWith("giver-1", "printing-1");
    expect(create).toHaveBeenCalled();
  });

  it("nets a request against the giver's supply, not the caller's", async () => {
    // The receiver asks for a card. Pending trades are always read for the
    // side that owns the copies (the giver), never the caller.
    const { repos, listPendingForGiverPrinting, create } = supplyRepos({
      [GROUP.id]: ["copy-1"],
    });

    await runCreate(repos, "receiver", 1);

    expect(listPendingForGiverPrinting).toHaveBeenCalledWith("giver-1", "printing-1");
    expect(create).toHaveBeenCalled();
  });

  it("refuses a request for a copy the giver already offered elsewhere", async () => {
    // The knock-on effect of committed supply: the copy is genuinely spoken for.
    const { repos, create } = supplyRepos({ [GROUP.id]: ["copy-1"] }, [
      { id: "existing-offer", groupId: GROUP.id, quantity: 1, initiator: "giver" },
    ]);

    const result = await runCreate(repos, "receiver", 1);

    expect((result as AppError).status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("lets a second offer through when it draws on a different group's copies", async () => {
    // Group A only ever sees copy-a; group B (the caller's group) only ever
    // sees copy-b. A live offer already sits in group A, but it can't touch
    // copy-b, so group B's offer still has a copy to give — a global count
    // would report 0 here.
    const { repos, create } = supplyRepos({ [GROUP.id]: ["copy-b"], "group-a": ["copy-a"] }, [
      { id: "offer-in-group-a", groupId: "group-a", quantity: 1, initiator: "giver" },
    ]);

    const result = await runCreate(repos, "giver", 1);

    expect(result).not.toBeInstanceOf(AppError);
    expect(create).toHaveBeenCalled();
  });
});

describe("setTradeQuantity supply accounting", () => {
  it("excludes the resized offer from its own claim", async () => {
    // Three copies; the only pending offer is this trade itself, so excluding
    // it from the claim pass leaves the giver's full stack to raise it into.
    const { repos, listPendingForGiverPrinting, setPendingQuantity } = supplyRepos(
      { [GROUP.id]: ["copy-1", "copy-2", "copy-3"] },
      [{ id: OFFER.id, groupId: GROUP.id, quantity: OFFER.quantity, initiator: "giver" }],
    );

    await setTradeQuantity(mockTransact(repos), OFFER.id, OFFER.giverUserId, 3);

    expect(listPendingForGiverPrinting).toHaveBeenCalledWith("giver-1", "printing-1");
    expect(setPendingQuantity).toHaveBeenCalledWith(OFFER.id, OFFER.giverUserId, 3);
  });

  it("still refuses a resize past the supply another pending offer holds", async () => {
    // Two copies; one is held by a different pending offer, so raising this
    // one to the full stack is still refused even though its own row is excluded.
    const { repos, setPendingQuantity } = supplyRepos({ [GROUP.id]: ["copy-1", "copy-2"] }, [
      { id: OFFER.id, groupId: GROUP.id, quantity: OFFER.quantity, initiator: "giver" },
      { id: "other-offer", groupId: GROUP.id, quantity: 1, initiator: "giver" },
    ]);

    const result = await setTradeQuantity(
      mockTransact(repos),
      OFFER.id,
      OFFER.giverUserId,
      2,
    ).catch((error: unknown) => error);

    expect((result as AppError).status).toBe(409);
    expect((result as AppError).message).toBe("Only 1 copy is still available");
    expect(setPendingQuantity).not.toHaveBeenCalled();
  });
});

/** The supply stands in for what the giver still offers after the drop. */
function sweepRepos(pending: Pending[], supplyByGroup: Record<string, string[]>) {
  const markAutoCancelled = vi.fn(() => Promise.resolve(1));
  const repos = {
    cardTrades: {
      listPendingForGiverPrinting: vi.fn(() => Promise.resolve(pending)),
      markAutoCancelled,
    },
    friendGroupMatches: {
      giverPrintingSupply: vi.fn(({ groupId }: { groupId: string }) =>
        Promise.resolve({
          unreservedCopyIds: supplyByGroup[groupId] ?? [],
          hasAny: (supplyByGroup[groupId] ?? []).length > 0,
        }),
      ),
    },
  } as unknown as Repos;
  return { repos, markAutoCancelled };
}

describe("autoCancelUnfillablePendingTrades", () => {
  it("cancels a pending request once the stack is empty", async () => {
    const { repos, markAutoCancelled } = sweepRepos(
      [{ id: "bob", groupId: "g1", quantity: 1, initiator: "receiver" }],
      { g1: [] },
    );

    const cancelled = await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1");

    expect(cancelled).toEqual(["bob"]);
    expect(markAutoCancelled).toHaveBeenCalledWith("bob");
  });

  it("keeps a request for 1 while one copy remains", async () => {
    const { repos, markAutoCancelled } = sweepRepos(
      [{ id: "bob", groupId: "g1", quantity: 1, initiator: "receiver" }],
      { g1: ["copy-1"] },
    );

    const cancelled = await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1");

    expect(cancelled).toEqual([]);
    expect(markAutoCancelled).not.toHaveBeenCalled();
  });

  it("cancels a request for 2 when only one copy remains", async () => {
    // The threshold is the trade's own quantity, not zero.
    const { repos } = sweepRepos(
      [{ id: "bob", groupId: "g1", quantity: 2, initiator: "receiver" }],
      { g1: ["copy-1"] },
    );

    expect(await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1")).toEqual([
      "bob",
    ]);
  });

  it("lets competing requests share the same copy, neither consuming it", async () => {
    const { repos, markAutoCancelled } = sweepRepos(
      [
        { id: "anna", groupId: "g1", quantity: 1, initiator: "receiver" },
        { id: "bob", groupId: "g1", quantity: 1, initiator: "receiver" },
      ],
      { g1: ["copy-1"] },
    );

    expect(await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1")).toEqual([]);
    expect(markAutoCancelled).not.toHaveBeenCalled();
  });

  it("keeps the older of two offers competing for one copy", async () => {
    // Both offers hold a commitment but only one copy is left. The list arrives
    // oldest first, so the first promise survives and the later one is closed.
    const { repos } = sweepRepos(
      [
        { id: "older", groupId: "g1", quantity: 1, initiator: "giver" },
        { id: "newer", groupId: "g1", quantity: 1, initiator: "giver" },
      ],
      { g1: ["copy-1"] },
    );

    expect(await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1")).toEqual([
      "newer",
    ]);
  });

  it("does not cancel an offer against its own commitment", async () => {
    const { repos, markAutoCancelled } = sweepRepos(
      [{ id: "mine", groupId: "g1", quantity: 2, initiator: "giver" }],
      { g1: ["copy-1", "copy-2"] },
    );

    expect(await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1")).toEqual([]);
    expect(markAutoCancelled).not.toHaveBeenCalled();
  });

  it("cancels a request the giver's surviving offer has already spoken for", async () => {
    // One copy left, committed by an offer. The request behind it is dead, but
    // the offer stands: offers are settled before requests are judged.
    const { repos } = sweepRepos(
      [
        { id: "offer", groupId: "g1", quantity: 1, initiator: "giver" },
        { id: "request", groupId: "g1", quantity: 1, initiator: "receiver" },
      ],
      { g1: ["copy-1"] },
    );

    expect(await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1")).toEqual([
      "request",
    ]);
  });

  it("does not cancel a request whose group still sees a copy an offer elsewhere cannot claim", async () => {
    // Different copies shared with different groups: the offer in g1 claims
    // copy-1, which g2 never saw, so the request in g2 is still fillable.
    const { repos, markAutoCancelled } = sweepRepos(
      [
        { id: "offer", groupId: "g1", quantity: 1, initiator: "giver" },
        { id: "request", groupId: "g2", quantity: 1, initiator: "receiver" },
      ],
      { g1: ["copy-1"], g2: ["copy-2"] },
    );

    expect(await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1")).toEqual([]);
    expect(markAutoCancelled).not.toHaveBeenCalled();
  });

  it("cancels nothing and reads no supply when the giver has no pending trades", async () => {
    const { repos, markAutoCancelled } = sweepRepos([], {});

    expect(await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1")).toEqual([]);
    expect(repos.friendGroupMatches.giverPrintingSupply).not.toHaveBeenCalled();
    expect(markAutoCancelled).not.toHaveBeenCalled();
  });

  it("records nothing when a concurrent transition already moved the row", async () => {
    const { repos, markAutoCancelled } = sweepRepos(
      [{ id: "bob", groupId: "g1", quantity: 1, initiator: "receiver" }],
      { g1: [] },
    );
    markAutoCancelled.mockResolvedValueOnce(0);

    expect(await autoCancelUnfillablePendingTrades(repos, "giver-1", "printing-1")).toEqual([]);
    expect(markAutoCancelled).toHaveBeenCalledWith("bob");
  });
});

/** Receiver-initiated, so the giver is the party who accepts it. */
const REQUEST = {
  ...TRADE,
  id: "request-1",
  initiator: "receiver",
} as unknown as LiveCardTrade;

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    printingId: "printing-1",
    collectionId: "col-1",
    collectionName: "Trade Binder",
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    notesPrivate: null,
    isAltered: false,
    links: [],
    ...overrides,
  };
}

/**
 * Every candidate survives the lock and the loan re-check, so the only thing
 * left to decide is which ids get pinned.
 */
function acceptRepos(trade: LiveCardTrade, candidates: ReturnType<typeof candidate>[]) {
  const pinCopies = vi.fn(async () => undefined);
  const markReserved = vi.fn(async () => 1);
  const listMetadataByIds = vi.fn(async (ids: readonly string[]) =>
    candidates.filter((row) => ids.includes(row.id)),
  );
  const repos = {
    cardTrades: {
      getById: vi.fn(async () => trade),
      pinCopies,
      markReserved,
      listPendingForGiverPrinting: vi.fn(async () => []),
      getDtoRowByIdForUser: vi.fn(async () => ({ ...DTO_ROW, id: trade.id })),
    },
    friendGroupMatches: {
      giverPrintingSupply: vi.fn(async () => ({
        unreservedCopyIds: candidates.map((row) => row.id),
        hasAny: candidates.length > 0,
      })),
    },
    copies: {
      lockByIds: vi.fn(async (ids: string[]) => ids),
      listMetadataByIds,
    },
    loans: {
      filterLoanedCopyIds: vi.fn(async () => []),
    },
  } as unknown as Repos;
  return { repos, pinCopies, markReserved, listMetadataByIds };
}

function runAccept(repos: Repos, trade: LiveCardTrade, copyIds?: string[]): Promise<unknown> {
  const acceptedBy = trade.initiator === "giver" ? trade.receiverUserId : trade.giverUserId;
  return acceptTrade(mockTransact(repos), trade.id, acceptedBy, copyIds).catch(
    (error: unknown) => error,
  );
}

describe("acceptTrade default copy choice", () => {
  it("pins the plainest copy, leaving the graded one alone", async () => {
    const { repos, pinCopies } = acceptRepos(REQUEST, [
      candidate("copy-graded", { grader: "psa", grade: 10 }),
      candidate("copy-plain"),
    ]);

    await runAccept(repos, REQUEST);

    expect(pinCopies).toHaveBeenCalledWith(REQUEST.id, ["copy-plain"]);
  });

  it("skips the metadata read when the whole stack is going anyway", async () => {
    const { repos, pinCopies, listMetadataByIds } = acceptRepos(REQUEST, [
      candidate("copy-graded", { grader: "psa", grade: 10 }),
    ]);

    await runAccept(repos, REQUEST);

    expect(listMetadataByIds).not.toHaveBeenCalled();
    expect(pinCopies).toHaveBeenCalledWith(REQUEST.id, ["copy-graded"]);
  });

  it("keeps the default for a receiver accepting the giver's offer", async () => {
    const { repos, pinCopies } = acceptRepos(TRADE, [
      candidate("copy-noted", { notesPublic: "signed at worlds" }),
      candidate("copy-plain"),
    ]);

    await runAccept(repos, TRADE);

    expect(pinCopies).toHaveBeenCalledWith(TRADE.id, ["copy-plain"]);
  });
});

describe("acceptTrade with a chosen copy", () => {
  it("pins exactly the copy the giver picked, graded or not", async () => {
    const { repos, pinCopies, markReserved } = acceptRepos(REQUEST, [
      candidate("copy-graded", { grader: "psa", grade: 10 }),
      candidate("copy-plain"),
    ]);

    await runAccept(repos, REQUEST, ["copy-graded"]);

    expect(pinCopies).toHaveBeenCalledWith(REQUEST.id, ["copy-graded"]);
    expect(markReserved).toHaveBeenCalled();
  });

  it("409s when the choice has the wrong count", async () => {
    const { repos, pinCopies } = acceptRepos(REQUEST, [candidate("copy-1"), candidate("copy-2")]);

    const result = await runAccept(repos, REQUEST, ["copy-1", "copy-2"]);

    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).status).toBe(409);
    expect((result as AppError).message).toBe("Choose exactly 1 copy");
    expect(pinCopies).not.toHaveBeenCalled();
  });

  it("409s on a duplicated id", async () => {
    const twoAtATime = { ...REQUEST, quantity: 2 } as unknown as LiveCardTrade;
    const { repos, pinCopies } = acceptRepos(twoAtATime, [
      candidate("copy-1"),
      candidate("copy-2"),
      candidate("copy-3"),
    ]);

    const result = await runAccept(repos, twoAtATime, ["copy-1", "copy-1"]);

    expect((result as AppError).status).toBe(409);
    expect((result as AppError).message).toBe("Choose each copy only once");
    expect(pinCopies).not.toHaveBeenCalled();
  });

  it("409s on an id outside the trade's supply", async () => {
    const { repos, pinCopies } = acceptRepos(REQUEST, [candidate("copy-1"), candidate("copy-2")]);

    const result = await runAccept(repos, REQUEST, ["someone-elses-copy"]);

    expect((result as AppError).status).toBe(409);
    expect((result as AppError).message).toBe(
      "One of those copies is no longer available to trade",
    );
    expect(pinCopies).not.toHaveBeenCalled();
  });

  it("403s when the receiver tries to pick the giver's copies", async () => {
    const { repos, pinCopies } = acceptRepos(TRADE, [
      candidate("copy-graded", { grader: "psa", grade: 10 }),
      candidate("copy-plain"),
    ]);

    const result = await runAccept(repos, TRADE, ["copy-graded"]);

    expect((result as AppError).status).toBe(403);
    expect(pinCopies).not.toHaveBeenCalled();
  });
});

describe("listTradeCopyOptions", () => {
  it("returns the candidates in default pin order for the giver", async () => {
    const { repos } = acceptRepos(REQUEST, [
      candidate("copy-graded", { grader: "psa", grade: 10 }),
      candidate("copy-plain"),
    ]);

    const result = await listTradeCopyOptions(repos, REQUEST.id, REQUEST.giverUserId);

    expect(result.tradeId).toBe(REQUEST.id);
    expect(result.quantity).toBe(1);
    expect(result.choiceMatters).toBe(true);
    expect(result.copies.map((row) => row.id)).toEqual(["copy-plain", "copy-graded"]);
  });

  it("does not prompt when the candidates are identical and unrecorded", async () => {
    const { repos } = acceptRepos(REQUEST, [candidate("copy-1"), candidate("copy-2")]);

    const result = await listTradeCopyOptions(repos, REQUEST.id, REQUEST.giverUserId);

    expect(result.choiceMatters).toBe(false);
    expect(result.copies).toHaveLength(2);
  });

  it("403s for the receiver, who never sees the giver's private notes", async () => {
    const { repos } = acceptRepos(REQUEST, [candidate("copy-1")]);

    const result = await listTradeCopyOptions(repos, REQUEST.id, REQUEST.receiverUserId).catch(
      (error: unknown) => error,
    );

    expect((result as AppError).status).toBe(403);
    expect(repos.friendGroupMatches.giverPrintingSupply).not.toHaveBeenCalled();
  });

  it("409s once the trade has left pending", async () => {
    const reserved = { ...REQUEST, status: "reserved" } as unknown as LiveCardTrade;
    const { repos } = acceptRepos(reserved, [candidate("copy-1")]);

    const result = await listTradeCopyOptions(repos, reserved.id, reserved.giverUserId).catch(
      (error: unknown) => error,
    );

    expect((result as AppError).status).toBe(409);
  });
});
