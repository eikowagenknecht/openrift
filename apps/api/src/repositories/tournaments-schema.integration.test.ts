import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";

const HOST_ID = crypto.randomUUID();
const ctx = createDbContext(HOST_ID);

describe.skipIf(!ctx)("tournaments schema invariants (integration)", () => {
  const { db } = ctx!;
  let orgId: string;

  beforeAll(async () => {
    await db
      .insertInto("users")
      .values({
        id: HOST_ID,
        email: `test-${HOST_ID}@test.com`,
        name: "Umbrella Host",
        emailVerified: true,
        image: null,
      })
      .execute();
    // The owner-guard trigger is deferred, so the org and its owner's
    // membership row must commit in the same transaction.
    orgId = await db.transaction().execute(async (trx) => {
      const org = await trx
        .insertInto("organizations")
        .values({ slug: `lgs-${HOST_ID.slice(14, 22)}`, name: "Test LGS" })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("organizationMembers")
        .values({ orgId: org.id, userId: HOST_ID, role: "owner" })
        .execute();
      return org.id;
    });
  });

  afterAll(async () => {
    await db.deleteFrom("tournaments").where("hostUserId", "=", HOST_ID).execute();
    await db.deleteFrom("organizations").where("id", "=", orgId).execute();
    await db.deleteFrom("users").where("id", "=", HOST_ID).execute();
  });

  it("accepts a user-hosted pod tournament", async () => {
    const row = await db
      .insertInto("tournaments")
      .values({ hostType: "user", hostUserId: HOST_ID, name: "User pod night" })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(row.hostType).toBe("user");
    expect(row.pairingStyle).toBe("pod");
  });

  it("accepts an organization-hosted tournament", async () => {
    const row = await db
      .insertInto("tournaments")
      .values({ hostType: "organization", hostOrgId: orgId, name: "Store Swiss" })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(row.hostOrgId).toBe(orgId);
    expect(row.hostUserId).toBeNull();
  });

  it("accepts a host-less tournament (detached host after account deletion)", async () => {
    const row = await db
      .insertInto("tournaments")
      .values({ hostType: "user", name: "No host" })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(row.hostUserId).toBeNull();
    expect(row.hostOrgId).toBeNull();
  });

  it("detaches the host and keeps the tournament when the host account is deleted", async () => {
    const detachHostId = crypto.randomUUID();
    await db
      .insertInto("users")
      .values({
        id: detachHostId,
        name: "Doomed Host",
        email: `test-${detachHostId}@test.com`,
        emailVerified: true,
      })
      .execute();
    const tournament = await db
      .insertInto("tournaments")
      .values({ hostType: "user", hostUserId: detachHostId, name: "Orphaned night" })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db.deleteFrom("users").where("id", "=", detachHostId).execute();

    const survivor = await db
      .selectFrom("tournaments")
      .selectAll()
      .where("id", "=", tournament.id)
      .executeTakeFirstOrThrow();
    expect(survivor.hostUserId).toBeNull();
    expect(survivor.name).toBe("Orphaned night");
  });

  it("rejects a tournament with both host FKs", async () => {
    await expect(
      db
        .insertInto("tournaments")
        .values({ hostType: "user", hostUserId: HOST_ID, hostOrgId: orgId, name: "Two hosts" })
        .execute(),
    ).rejects.toThrow();
  });

  it("rejects an unknown pairing style", async () => {
    await expect(
      db
        .insertInto("tournaments")
        // @ts-expect-error — exercising the DB CHECK with an out-of-enum value.
        .values({
          hostType: "user",
          hostUserId: HOST_ID,
          name: "Bad pairing",
          pairingStyle: "bracket",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("accepts a swiss tournament with the swiss defaults", async () => {
    const row = await db
      .insertInto("tournaments")
      .values({
        hostType: "user",
        hostUserId: HOST_ID,
        name: "Swiss night",
        pairingStyle: "swiss",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(row.pairingStyle).toBe("swiss");
    expect(row.matchFormat).toBe("bo1");
    expect(row.winPoints).toBe(3);
    expect(row.drawPoints).toBe(1);
    expect(row.regionsEnabled).toBe(false);
  });

  it("accepts an empty tournament with no pairings and no decks", async () => {
    const row = await db
      .insertInto("tournaments")
      .values({
        hostType: "user",
        hostUserId: HOST_ID,
        name: "Just a meetup",
        pairingStyle: "none",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(row.pairingStyle).toBe("none");
    expect(row.deckSubmission).toBe("none");
  });

  it("accepts a no-pairings tournament that takes decks", async () => {
    const row = await db
      .insertInto("tournaments")
      .values({
        hostType: "user",
        hostUserId: HOST_ID,
        name: "Deck check only",
        pairingStyle: "none",
        deckSubmission: "required",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(row.pairingStyle).toBe("none");
    expect(row.deckSubmission).toBe("required");
  });

  it("allows unlimited walk-in participants but one per linked account", async () => {
    const tournament = await db
      .insertInto("tournaments")
      .values({ hostType: "user", hostUserId: HOST_ID, name: "Roster" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("tournamentParticipants")
      .values([
        { tournamentId: tournament.id, displayName: "Walk-in A" },
        { tournamentId: tournament.id, displayName: "Walk-in B" },
      ])
      .execute();
    await db
      .insertInto("tournamentParticipants")
      .values({ tournamentId: tournament.id, displayName: "Linked", userId: HOST_ID })
      .execute();
    await expect(
      db
        .insertInto("tournamentParticipants")
        .values({ tournamentId: tournament.id, displayName: "Linked again", userId: HOST_ID })
        .execute(),
    ).rejects.toThrow();
    await db.deleteFrom("tournaments").where("id", "=", tournament.id).execute();
  });

  it("cascades tournament deletion to its staff rows", async () => {
    const tournament = await db
      .insertInto("tournaments")
      .values({ hostType: "user", hostUserId: HOST_ID, name: "Staffed" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("tournamentStaff")
      .values({ tournamentId: tournament.id, userId: HOST_ID, role: "judge" })
      .execute();
    await db.deleteFrom("tournaments").where("id", "=", tournament.id).execute();
    const staff = await db
      .selectFrom("tournamentStaff")
      .selectAll()
      .where("tournamentId", "=", tournament.id)
      .execute();
    expect(staff).toHaveLength(0);
  });
});
