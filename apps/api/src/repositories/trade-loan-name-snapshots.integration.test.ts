import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { friendGroupsRepo } from "./friend-groups.js";

// `trg_snapshot_deleted_user_names` cancels the deleted account's live trades
// and swaps each party reference for the display name it had at deletion, so
// the counterparty keeps a readable record.
// One deletion in `beforeAll`; each test reads a different part of the result.
const LEAVER_ID = crypto.randomUUID();
const GIVER_ID = crypto.randomUUID();
const RECEIVER_ID = crypto.randomUUID();
const LENDER_ID = crypto.randomUUID();
const SURVIVING_IDS = [GIVER_ID, RECEIVER_ID, LENDER_ID];

const ctx = createDbContext(GIVER_ID);

describe.skipIf(!ctx)("deleted-user name snapshots (integration)", () => {
  const { db } = ctx!;
  const groupsRepo = friendGroupsRepo(db);

  let groupId: string;
  let completedTradeId: string;
  let pendingTradeId: string;
  let loanId: string;

  beforeAll(async () => {
    await seedTestUser(db, { id: LEAVER_ID });
    for (const id of SURVIVING_IDS) {
      await seedTestUser(db, { id });
    }
    // The display name the snapshot must capture; `seedTestUser` names everyone
    // "Test User", which would not prove the value came from this row.
    await db
      .updateTable("users")
      .set({ name: "Ekko Timewinder" })
      .where("id", "=", LEAVER_ID)
      .execute();

    const group = await groupsRepo.createWithOwner(
      {
        slug: `snapshot-248-${LEAVER_ID.slice(0, 8)}`,
        name: "Snapshot Test Group",
        description: null,
        code: null,
      },
      GIVER_ID,
    );
    groupId = group.id;
    await groupsRepo.addMember(groupId, LEAVER_ID, "member");
    await groupsRepo.addMember(groupId, RECEIVER_ID, "member");

    const completed = await db
      .insertInto("cardTrades")
      .values({
        groupId,
        giverUserId: GIVER_ID,
        receiverUserId: LEAVER_ID,
        initiator: "receiver",
        printingId: PRINTING_1.id,
        cardId: PRINTING_1.cardId,
        quantity: 1,
        status: "completed",
        acceptedAt: new Date("2026-03-01T00:00:00Z"),
        completedAt: new Date("2026-03-02T00:00:00Z"),
        giverSyncAppliedAt: new Date("2026-03-02T00:00:00Z"),
        receiverSyncAppliedAt: new Date("2026-03-02T00:00:00Z"),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    completedTradeId = completed.id;

    const pending = await db
      .insertInto("cardTrades")
      .values({
        groupId,
        giverUserId: LEAVER_ID,
        receiverUserId: RECEIVER_ID,
        initiator: "giver",
        printingId: PRINTING_1.id,
        cardId: PRINTING_1.cardId,
        quantity: 1,
        status: "pending",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    pendingTradeId = pending.id;

    const loan = await db
      .insertInto("loans")
      .values({
        lenderUserId: LENDER_ID,
        borrowerUserId: LEAVER_ID,
        printingId: PRINTING_1.id,
        cardId: PRINTING_1.cardId,
        quantity: 2,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    loanId = loan.id;

    await db.deleteFrom("users").where("id", "=", LEAVER_ID).execute();
  });

  afterAll(async () => {
    await db
      .deleteFrom("cardTrades")
      .where("id", "in", [completedTradeId, pendingTradeId])
      .execute();
    await db.deleteFrom("loans").where("id", "=", loanId).execute();
    await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
    await db.deleteFrom("users").where("id", "in", SURVIVING_IDS).execute();
  });

  it("keeps a completed trade and snapshots the deleted party's name", async () => {
    const trade = await db
      .selectFrom("cardTrades")
      .select(["status", "giverUserId", "giverName", "receiverUserId", "receiverName"])
      .where("id", "=", completedTradeId)
      .executeTakeFirst();
    expect(trade).toBeDefined();
    expect(trade?.status).toBe("completed");
    expect(trade?.receiverUserId).toBeNull();
    expect(trade?.receiverName).toBe("Ekko Timewinder");
    expect(trade?.giverUserId).toBe(GIVER_ID);
    expect(trade?.giverName).toBeNull();
  });

  it("cancels the live trade the deleted account was in", async () => {
    const trade = await db
      .selectFrom("cardTrades")
      .select(["status", "closedAt", "expiresAt", "giverUserId", "giverName"])
      .where("id", "=", pendingTradeId)
      .executeTakeFirst();
    expect(trade?.status).toBe("cancelled");
    expect(trade?.closedAt).not.toBeNull();
    expect(trade?.expiresAt).toBeNull();
    expect(trade?.giverUserId).toBeNull();
    expect(trade?.giverName).toBe("Ekko Timewinder");
  });

  it("snapshots a loan's borrower instead of leaving it nameless", async () => {
    const loan = await db
      .selectFrom("loans")
      .select(["borrowerUserId", "borrowerName", "lenderUserId"])
      .where("id", "=", loanId)
      .executeTakeFirst();
    expect(loan?.borrowerUserId).toBeNull();
    expect(loan?.borrowerName).toBe("Ekko Timewinder");
    expect(loan?.lenderUserId).toBe(LENDER_ID);
  });

  it("refuses a trade party that is both a user and a snapshot", async () => {
    await expect(
      db
        .updateTable("cardTrades")
        .set({ giverName: "Impostor" })
        .where("id", "=", completedTradeId)
        .execute(),
    ).rejects.toThrow();
  });

  it("refuses a loan borrower that is neither a user nor a name", async () => {
    await expect(
      db.updateTable("loans").set({ borrowerName: null }).where("id", "=", loanId).execute(),
    ).rejects.toThrow();
  });
});
