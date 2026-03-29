import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { wishListsRepo } from "./wish-lists.js";

const LIST = {
  id: "wl-1",
  userId: "u1",
  name: "Want",
  rules: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const ITEM = {
  id: "wli-1",
  wishListId: "wl-1",
  userId: "u1",
  cardId: "c-1",
  printingId: null,
  quantityDesired: 4,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("wishListsRepo", () => {
  it("listForUser returns wish lists", async () => {
    const db = createMockDb([LIST]);
    expect(await wishListsRepo(db).listForUser("u1")).toEqual([LIST]);
  });

  it("getByIdForUser returns a wish list", async () => {
    const db = createMockDb([LIST]);
    expect(await wishListsRepo(db).getByIdForUser("wl-1", "u1")).toEqual(LIST);
  });

  it("exists returns id when found", async () => {
    const db = createMockDb([{ id: "wl-1" }]);
    expect(await wishListsRepo(db).exists("wl-1", "u1")).toEqual({ id: "wl-1" });
  });

  it("create returns the created wish list", async () => {
    const db = createMockDb([LIST]);
    expect(await wishListsRepo(db).create({ userId: "u1", name: "Want", rules: null })).toEqual(
      LIST,
    );
  });

  it("update returns the updated wish list", async () => {
    const db = createMockDb([LIST]);
    expect(await wishListsRepo(db).update("wl-1", "u1", { name: "Updated" })).toEqual(LIST);
  });

  it("deleteByIdForUser returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    expect(await wishListsRepo(db).deleteByIdForUser("wl-1", "u1")).toEqual({ numDeletedRows: 1n });
  });

  it("items returns wish list items", async () => {
    const db = createMockDb([ITEM]);
    expect(await wishListsRepo(db).items("wl-1", "u1")).toEqual([ITEM]);
  });

  it("createItem returns the created item", async () => {
    const db = createMockDb([ITEM]);
    expect(
      await wishListsRepo(db).createItem({
        wishListId: "wl-1",
        userId: "u1",
        cardId: "c-1",
        printingId: null,
        quantityDesired: 4,
      }),
    ).toEqual(ITEM);
  });

  it("updateItem returns the updated item", async () => {
    const db = createMockDb([ITEM]);
    expect(
      await wishListsRepo(db).updateItem("wli-1", "wl-1", "u1", { quantityDesired: 2 }),
    ).toEqual(ITEM);
  });

  it("deleteItem returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    expect(await wishListsRepo(db).deleteItem("wli-1", "wl-1", "u1")).toEqual({
      numDeletedRows: 1n,
    });
  });

  it("allItemsForUser returns items across all wish lists", async () => {
    const row = {
      wishListId: "wl-1",
      wishListName: "Want",
      cardId: "c-1",
      printingId: null,
      quantityDesired: 4,
    };
    const db = createMockDb([row]);
    expect(await wishListsRepo(db).allItemsForUser("u1")).toEqual([row]);
  });
});
