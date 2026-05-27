import { describe, expect, it } from "vitest";

import { gravatarHashForEmail } from "../lib/gravatar.js";
import { createMockDb } from "../test/mock-db.js";
import { friendGroupMatchesRepo } from "./friend-group-matches.js";

const DB_ROW = {
  counterpartyUserId: "u-seller",
  counterpartyName: "Alice",
  counterpartyImage: null,
  counterpartyEmail: "alice@example.com",
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

function expectedRow(overrides: Partial<typeof DB_ROW> = {}): unknown {
  const merged = { ...DB_ROW, ...overrides };
  const { counterpartyEmail, ...rest } = merged;
  return { ...rest, counterpartyGravatarHash: gravatarHashForEmail(counterpartyEmail) };
}

describe("friendGroupMatchesRepo", () => {
  it("othersHaveYourWants returns rows in the expected shape", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([DB_ROW]));
    const rows = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u-buyer" });
    expect(rows).toEqual([expectedRow()]);
  });

  it("othersWantYourHaves returns rows in the expected shape", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([DB_ROW]));
    const rows = await repo.othersWantYourHaves({ groupId: "grp-1", viewerUserId: "u-seller" });
    expect(rows).toEqual([expectedRow()]);
  });

  it("sorts by counterparty name then card name", async () => {
    const a = { ...DB_ROW, counterpartyName: "Alice", cardName: "Beta" };
    const aa = { ...DB_ROW, counterpartyName: "Alice", cardName: "Alpha" };
    const b = { ...DB_ROW, counterpartyName: "Bob", cardName: "Alpha" };
    const repo = friendGroupMatchesRepo(createMockDb([b, a, aa]));
    const rows = await repo.othersHaveYourWants({ groupId: "grp-1", viewerUserId: "u" });
    expect(rows.map((r) => `${r.counterpartyName ?? ""}::${r.cardName}`)).toEqual([
      "Alice::Alpha",
      "Alice::Beta",
      "Bob::Alpha",
    ]);
  });

  it("scopes the query when counterpartyUserId is given", async () => {
    const repo = friendGroupMatchesRepo(createMockDb([DB_ROW]));
    const rows = await repo.othersHaveYourWants({
      groupId: "grp-1",
      viewerUserId: "u-buyer",
      counterpartyUserId: "u-seller",
    });
    expect(rows).toEqual([expectedRow()]);
  });
});
