import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { tradeListsRepo } from "./trade-lists.js";

const LIST = {
  id: "tl-1",
  userId: "u1",
  name: "Trades",
  rules: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const ITEM = {
  id: "tli-1",
  tradeListId: "tl-1",
  userId: "u1",
  copyId: "cp-1",
  createdAt: new Date(),
};

describe("tradeListsRepo", () => {
  it("listForUser returns trade lists", async () => {
    const db = createMockDb([LIST]);
    expect(await tradeListsRepo(db).listForUser("u1")).toEqual([LIST]);
  });

  it("getByIdForUser returns a trade list", async () => {
    const db = createMockDb([LIST]);
    expect(await tradeListsRepo(db).getByIdForUser("tl-1", "u1")).toEqual(LIST);
  });

  it("exists returns id when found", async () => {
    const db = createMockDb([{ id: "tl-1" }]);
    expect(await tradeListsRepo(db).exists("tl-1", "u1")).toEqual({ id: "tl-1" });
  });

  it("create returns the created trade list", async () => {
    const db = createMockDb([LIST]);
    expect(await tradeListsRepo(db).create({ userId: "u1", name: "Trades", rules: null })).toEqual(
      LIST,
    );
  });

  it("update returns the updated trade list", async () => {
    const db = createMockDb([LIST]);
    expect(await tradeListsRepo(db).update("tl-1", "u1", { name: "Updated" })).toEqual(LIST);
  });

  it("deleteByIdForUser returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const result = await tradeListsRepo(db).deleteByIdForUser("tl-1", "u1");
    expect(result).toEqual({ numDeletedRows: 1n });
  });

  it("itemsWithDetails returns items with card details", async () => {
    const row = {
      id: "tli-1",
      tradeListId: "tl-1",
      copyId: "cp-1",
      printingId: "p-1",
      collectionId: "col-1",
      setId: "s-1",
      rarity: "rare",
      finish: "normal",
      imageUrl: null,
      cardName: "Card",
      cardType: "unit",
    };
    const db = createMockDb([row]);
    expect(await tradeListsRepo(db).itemsWithDetails("tl-1", "u1")).toEqual([row]);
  });

  it("createItem returns the created item", async () => {
    const db = createMockDb([ITEM]);
    expect(
      await tradeListsRepo(db).createItem({ tradeListId: "tl-1", userId: "u1", copyId: "cp-1" }),
    ).toEqual(ITEM);
  });

  it("deleteItem returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const result = await tradeListsRepo(db).deleteItem("tli-1", "tl-1", "u1");
    expect(result).toEqual({ numDeletedRows: 1n });
  });
});
