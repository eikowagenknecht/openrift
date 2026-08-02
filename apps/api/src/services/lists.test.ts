/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import type { ListIntent, ListKind } from "@openrift/shared";
import type { DeleteResult, Selectable } from "kysely";
import { describe, expect, it, vi } from "vitest";

import type { ListEntriesTable, ListsTable } from "../db/index.js";
import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { moveListEntries } from "./lists.js";

function mockTransact(trxRepos: Repos): Transact {
  return (fn) => fn(trxRepos) as any;
}

function buildList(
  overrides: Partial<Selectable<ListsTable>> & { id: string; kind: ListKind; intent: ListIntent },
): Selectable<ListsTable> {
  return {
    userId: "user-1",
    name: overrides.id,
    isPublic: false,
    shareToken: null,
    defaultPricePref: null,
    defaultPriceAbsoluteCents: null,
    defaultTradeType: null,
    currency: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Selectable<ListsTable>;
}

function buildEntry(
  overrides: Pick<Selectable<ListEntriesTable>, "id" | "kind"> &
    Partial<Selectable<ListEntriesTable>>,
): Pick<
  Selectable<ListEntriesTable>,
  | "id"
  | "kind"
  | "cardId"
  | "printingId"
  | "copyId"
  | "quantity"
  | "pricePref"
  | "priceAbsoluteCents"
  | "tradeType"
> {
  return {
    id: overrides.id,
    kind: overrides.kind,
    cardId: overrides.cardId ?? null,
    printingId: overrides.printingId ?? null,
    copyId: overrides.copyId ?? null,
    quantity: overrides.quantity ?? 1,
    pricePref: overrides.pricePref ?? null,
    priceAbsoluteCents: overrides.priceAbsoluteCents ?? null,
    tradeType: overrides.tradeType ?? null,
  };
}

interface MockOverrides {
  source?: ReturnType<typeof buildList>;
  destination?: ReturnType<typeof buildList>;
  entries?: ReturnType<typeof buildEntry>[];
  bulkResult?: { inserted: number; updated: number };
  deleteCount?: number;
}

function createMockRepos(overrides: MockOverrides = {}) {
  const bulkCreateEntries = vi
    .fn()
    .mockResolvedValue(
      overrides.bulkResult ?? { inserted: overrides.entries?.length ?? 0, updated: 0 },
    );
  const deleteEntriesByIds = vi.fn().mockResolvedValue({
    numDeletedRows: BigInt(overrides.deleteCount ?? overrides.entries?.length ?? 0),
  } as DeleteResult);
  const entriesForMove = vi.fn().mockResolvedValue(overrides.entries ?? []);
  const getByIdForUser = vi.fn().mockImplementation((id: string) => {
    if (overrides.source && id === overrides.source.id) {
      return Promise.resolve(overrides.source);
    }
    if (overrides.destination && id === overrides.destination.id) {
      return Promise.resolve(overrides.destination);
    }
    return Promise.resolve(undefined);
  });

  const repos = {
    lists: { getByIdForUser, entriesForMove, bulkCreateEntries, deleteEntriesByIds },
  } as unknown as Repos;

  return { repos, bulkCreateEntries, deleteEntriesByIds, entriesForMove, getByIdForUser };
}

describe("moveListEntries", () => {
  it("rejects when source and destination are the same list", async () => {
    const { repos } = createMockRepos();
    await expect(
      moveListEntries(repos, mockTransact(repos), "user-1", "list-a", "list-a", ["entry-1"]),
    ).rejects.toThrow(/Source and destination must differ/u);
  });

  it("rejects when the source list is missing", async () => {
    const destination = buildList({ id: "list-b", kind: "card", intent: "wish" });
    const { repos } = createMockRepos({ destination });
    await expect(
      moveListEntries(repos, mockTransact(repos), "user-1", "list-a", "list-b", ["entry-1"]),
    ).rejects.toThrow(AppError);
  });

  it("rejects when the destination list is missing", async () => {
    const source = buildList({ id: "list-a", kind: "card", intent: "wish" });
    const { repos } = createMockRepos({ source });
    await expect(
      moveListEntries(repos, mockTransact(repos), "user-1", "list-a", "list-b", ["entry-1"]),
    ).rejects.toThrow(/Destination list not found/u);
  });

  it("rejects when kinds differ", async () => {
    const source = buildList({ id: "list-a", kind: "card", intent: "wish" });
    const destination = buildList({ id: "list-b", kind: "printing", intent: "wish" });
    const { repos } = createMockRepos({ source, destination });
    await expect(
      moveListEntries(repos, mockTransact(repos), "user-1", "list-a", "list-b", ["entry-1"]),
    ).rejects.toThrow(/same kind/u);
  });

  it("rejects when intents differ", async () => {
    const source = buildList({ id: "list-a", kind: "card", intent: "wish" });
    const destination = buildList({ id: "list-b", kind: "card", intent: "trade" });
    const { repos } = createMockRepos({ source, destination });
    await expect(
      moveListEntries(repos, mockTransact(repos), "user-1", "list-a", "list-b", ["entry-1"]),
    ).rejects.toThrow(/same intent/u);
  });

  it("returns zero counts and skips the destination write when no matching entries are found", async () => {
    const source = buildList({ id: "list-a", kind: "card", intent: "wish" });
    const destination = buildList({ id: "list-b", kind: "card", intent: "wish" });
    const { repos, bulkCreateEntries, deleteEntriesByIds } = createMockRepos({
      source,
      destination,
      entries: [],
    });

    const result = await moveListEntries(repos, mockTransact(repos), "user-1", "list-a", "list-b", [
      "entry-stale",
    ]);

    expect(result).toEqual({ moved: 0, merged: 0 });
    expect(bulkCreateEntries).not.toHaveBeenCalled();
    expect(deleteEntriesByIds).not.toHaveBeenCalled();
  });

  it("moves entries: forwards card/printing/copy targets, reports merged for upserts", async () => {
    const source = buildList({ id: "list-a", kind: "card", intent: "wish" });
    const destination = buildList({ id: "list-b", kind: "card", intent: "wish" });
    const entries = [
      buildEntry({ id: "entry-1", kind: "card", cardId: "card-1", quantity: 2 }),
      buildEntry({ id: "entry-2", kind: "card", cardId: "card-2", quantity: 1 }),
    ];
    const { repos, bulkCreateEntries, deleteEntriesByIds } = createMockRepos({
      source,
      destination,
      entries,
      bulkResult: { inserted: 1, updated: 1 },
      deleteCount: 2,
    });

    const result = await moveListEntries(repos, mockTransact(repos), "user-1", "list-a", "list-b", [
      "entry-1",
      "entry-2",
    ]);

    expect(result).toEqual({ moved: 2, merged: 1 });
    expect(bulkCreateEntries).toHaveBeenCalledTimes(1);
    const [kindArg, valuesArg] = bulkCreateEntries.mock.calls[0];
    expect(kindArg).toBe("card");
    expect(valuesArg).toEqual([
      expect.objectContaining({
        listId: "list-b",
        userId: "user-1",
        kind: "card",
        cardId: "card-1",
        printingId: null,
        copyId: null,
        quantity: 2,
      }),
      expect.objectContaining({
        listId: "list-b",
        cardId: "card-2",
        quantity: 1,
      }),
    ]);
    expect(deleteEntriesByIds).toHaveBeenCalledWith(["entry-1", "entry-2"], "list-a", "user-1");
  });

  it("preserves the source entry's tradeOverride on the destination insert", async () => {
    const source = buildList({ id: "list-a", kind: "printing", intent: "trade" });
    const destination = buildList({ id: "list-b", kind: "printing", intent: "trade" });
    const entries = [
      buildEntry({
        id: "entry-1",
        kind: "printing",
        printingId: "printing-1",
        quantity: 1,
        pricePref: "absolute",
        priceAbsoluteCents: 1500,
        tradeType: "money",
      }),
    ];
    const { repos, bulkCreateEntries } = createMockRepos({
      source,
      destination,
      entries,
      bulkResult: { inserted: 1, updated: 0 },
      deleteCount: 1,
    });

    await moveListEntries(repos, mockTransact(repos), "user-1", "list-a", "list-b", ["entry-1"]);

    const [, valuesArg] = bulkCreateEntries.mock.calls[0];
    expect(valuesArg[0]).toEqual(
      expect.objectContaining({
        pricePref: "absolute",
        priceAbsoluteCents: 1500,
        tradeType: "money",
      }),
    );
  });
});
