import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";

const OWNER_ID = crypto.randomUUID();
const CO_OWNER_ID = crypto.randomUUID();
const MANAGER_ID = crypto.randomUUID();
const JUDGE_ID = crypto.randomUUID();
const OUTSIDER_ID = crypto.randomUUID();
const ctx = createDbContext(OWNER_ID);

describe.skipIf(!ctx)("organization owner rebalance on user deletion (integration)", () => {
  const { db } = ctx!;
  let coOwnedOrgId: string;
  let mixedOrgId: string;
  let soloOrgId: string;
  let survivingOrgId: string;

  async function insertOrg(slug: string, ownerUserId: string): Promise<string> {
    return db.transaction().execute(async (trx) => {
      const org = await trx
        .insertInto("organizations")
        .values({ slug, name: "Rebalance Test LGS" })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("organizationMembers")
        .values({
          orgId: org.id,
          userId: ownerUserId,
          role: "owner",
          joinedAt: new Date("2026-01-01T00:00:00Z"),
        })
        .execute();
      return org.id;
    });
  }

  beforeAll(async () => {
    await seedTestUser(db, { id: OWNER_ID });
    await seedTestUser(db, { id: CO_OWNER_ID });
    await seedTestUser(db, { id: MANAGER_ID });
    await seedTestUser(db, { id: JUDGE_ID });
    await seedTestUser(db, { id: OUTSIDER_ID });

    // Org 1: a co-owner plus a manager. The co-owner already carries the role,
    // so the deletion must change nothing for the survivors.
    coOwnedOrgId = await insertOrg("rebalance-co-owned-254", OWNER_ID);
    await db
      .insertInto("organizationMembers")
      .values([
        {
          orgId: coOwnedOrgId,
          userId: CO_OWNER_ID,
          role: "owner",
          joinedAt: new Date("2026-02-01T00:00:00Z"),
        },
        {
          orgId: coOwnedOrgId,
          userId: MANAGER_ID,
          role: "manager",
          joinedAt: new Date("2026-01-15T00:00:00Z"),
        },
      ])
      .execute();

    // Org 2: no second owner. A judge joined first and a manager later, so role
    // rank has to beat join order and the manager is promoted.
    mixedOrgId = await insertOrg("rebalance-mixed-254", OWNER_ID);
    await db
      .insertInto("organizationMembers")
      .values([
        {
          orgId: mixedOrgId,
          userId: JUDGE_ID,
          role: "judge",
          joinedAt: new Date("2026-01-15T00:00:00Z"),
        },
        {
          orgId: mixedOrgId,
          userId: MANAGER_ID,
          role: "manager",
          joinedAt: new Date("2026-02-01T00:00:00Z"),
        },
      ])
      .execute();

    // Org 3: the owner is the only member.
    soloOrgId = await insertOrg("rebalance-solo-254", OWNER_ID);

    // Org 4: untouched by the deletion, so the guard tests below have a stable org.
    survivingOrgId = await insertOrg("rebalance-surviving-254", OUTSIDER_ID);

    await db.deleteFrom("users").where("id", "=", OWNER_ID).execute();
  });

  afterAll(async () => {
    await db
      .deleteFrom("organizations")
      .where("id", "in", [coOwnedOrgId, mixedOrgId, soloOrgId, survivingOrgId])
      .execute();
    await db
      .deleteFrom("users")
      .where("id", "in", [CO_OWNER_ID, MANAGER_ID, JUDGE_ID, OUTSIDER_ID])
      .execute();
  });

  it("changes nothing when a co-owner survives", async () => {
    // The co-owner already held the role, so the deleted owner's membership
    // simply cascades away — the manager in particular is not promoted.
    const members = await db
      .selectFrom("organizationMembers")
      .select(["userId", "role"])
      .where("orgId", "=", coOwnedOrgId)
      .execute();
    expect(members).toHaveLength(2);
    expect(members.find((member) => member.userId === CO_OWNER_ID)?.role).toBe("owner");
    expect(members.find((member) => member.userId === MANAGER_ID)?.role).toBe("manager");
  });

  it("promotes the highest-ranked member when no owner survives", async () => {
    const members = await db
      .selectFrom("organizationMembers")
      .select(["userId", "role"])
      .where("orgId", "=", mixedOrgId)
      .execute();
    expect(members.find((member) => member.userId === MANAGER_ID)?.role).toBe("owner");
    // The judge who joined earlier stays a judge: role rank beats join order.
    expect(members.find((member) => member.userId === JUDGE_ID)?.role).toBe("judge");
  });

  it("still deletes an org whose owner was the only member", async () => {
    const org = await db
      .selectFrom("organizations")
      .select(["id"])
      .where("id", "=", soloOrgId)
      .executeTakeFirst();
    expect(org).toBeUndefined();
  });

  it("allows a second owner-role member on one org", async () => {
    await db
      .insertInto("organizationMembers")
      .values({ orgId: survivingOrgId, userId: MANAGER_ID, role: "owner" })
      .execute();
    const owners = await db
      .selectFrom("organizationMembers")
      .select(["userId"])
      .where("orgId", "=", survivingOrgId)
      .where("role", "=", "owner")
      .execute();
    expect(owners).toHaveLength(2);
    // Put the org back to one owner for the guard tests below.
    await db
      .deleteFrom("organizationMembers")
      .where("orgId", "=", survivingOrgId)
      .where("userId", "=", MANAGER_ID)
      .execute();
  });

  it("refuses to demote an org's last owner", async () => {
    // Deferred constraint trigger: fails at commit.
    await expect(
      db.transaction().execute(async (trx) => {
        await trx
          .updateTable("organizationMembers")
          .set({ role: "manager" })
          .where("orgId", "=", survivingOrgId)
          .where("userId", "=", OUTSIDER_ID)
          .execute();
      }),
    ).rejects.toThrow(/at least one owner/u);
  });

  it("refuses to remove an org's last owner", async () => {
    await expect(
      db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("organizationMembers")
          .where("orgId", "=", survivingOrgId)
          .where("userId", "=", OUTSIDER_ID)
          .execute();
      }),
    ).rejects.toThrow(/at least one owner/u);
  });

  it("refuses an organization inserted without an owner membership", async () => {
    await expect(
      db
        .insertInto("organizations")
        .values({ slug: "rebalance-ownerless-254", name: "Ownerless LGS" })
        .execute(),
    ).rejects.toThrow(/at least one owner/u);
  });

  it("still deletes an organization outright with its members", async () => {
    // The guard must not block org deletion itself: the members cascade away
    // while the org row is already gone by commit time.
    const orgId = await insertOrg("rebalance-deletable-254", OUTSIDER_ID);
    await db.deleteFrom("organizations").where("id", "=", orgId).execute();
    const members = await db
      .selectFrom("organizationMembers")
      .select("userId")
      .where("orgId", "=", orgId)
      .execute();
    expect(members).toHaveLength(0);
  });
});
