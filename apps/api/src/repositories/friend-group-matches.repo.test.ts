import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { friendGroupMatchesRepo } from "./friend-group-matches.js";

const ROW = {
  counterpartyUserId: "u-seller",
  counterpartyName: "Alice",
  counterpartyImage: null,
  counterpartyNickname: "Tuesday Alice",
  counterpartyListId: "lst-sell",
  counterpartyListName: "Spare Foils",
  sellEntryId: "le-1",
  sellListId: "lst-1",
  copyId: "cpy-1",
  printingId: "prt-1",
  cardId: "crd-1",
  cardName: "Annie, Fiery",
  cardType: "unit" as const,
  setId: "set-1",
  rarity: "common" as const,
  finish: "regular" as const,
  imageId: null,
  buyEntryId: "le-2",
  buyListId: "lst-2",
  buyEntryKind: "card" as const,
  buyQuantity: 1,
};

describe("friendGroupMatchesRepo", () => {
  it("othersHaveYourWants returns rows in the expected shape", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([ROW]));
    const rows = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u-buyer" });
    expect(rows).toEqual([ROW]);
  });

  it("othersWantYourHaves returns rows in the expected shape", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([ROW]));
    const rows = await repo.othersWantYourHaves({ groupId: "grp-1", viewerUserId: "u-seller" });
    expect(rows).toEqual([ROW]);
  });

  it("sorts by counterparty name then card name", async () => {
    const a = { ...ROW, counterpartyName: "Alice", cardName: "Beta" };
    const aa = { ...ROW, counterpartyName: "Alice", cardName: "Alpha" };
    const b = { ...ROW, counterpartyName: "Bob", cardName: "Alpha" };
    const repo = friendGroupMatchesRepo(createMockDb([b, a, aa]));
    const rows = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u" });
    expect(rows.map((r) => `${r.counterpartyName ?? ""}::${r.cardName}`)).toEqual([
      "Alice::Alpha",
      "Alice::Beta",
      "Bob::Alpha",
    ]);
  });

  it("scopes the query when counterpartyUserId is given", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([ROW]));
    const rows = await repo.othersHaveYourWants({
      groupId: "grp-1",
      viewerUserId: "u-buyer",
      counterpartyUserId: "u-seller",
    });
    expect(rows).toEqual([ROW]);
  });
});
