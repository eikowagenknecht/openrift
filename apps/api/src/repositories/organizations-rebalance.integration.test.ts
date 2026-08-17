import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";

// Migration 188 invariants: deleting a user account must rebalance the
// organizations they own to the best surviving member (owner > manager >
// judge, oldest first) instead of cascading the org away. Only a memberless
// org dies with its owner.
//
// Migration 249 refines two things. An org may have several `owner` members, so
// when one of them survives the primary owner's deletion the pointer simply
// moves to them and no role changes — a promotion would be a lie about what
// happened. Promotion is the fallback for when no owner-role member is left.
// And `fk_organizations_owner_membership` (deferred to commit) now requires
// `organizations.owner_user_id` to name a member of that org, which is why the
// fixtures below insert each org together with its owner's membership row in
// one transaction.
//
// Random per-file users (seeded via seedTestUser in beforeAll) so this file
// cannot collide with pre-seeded registry users or other files' fixtures.
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

  /** @returns The id of a new org whose only member is `ownerUserId`, as owner. */
  async function insertOrg(slug: string, ownerUserId: string): Promise<string> {
    return db.transaction().execute(async (trx) => {
      const org = await trx
        .insertInto("organizations")
        .values({ slug, name: "Rebalance Test LGS", ownerUserId })
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

    // Org 1: a co-owner who joined after the primary owner, plus a manager who
    // joined before them. The co-owner wins on role, and nobody is promoted.
    coOwnedOrgId = await insertOrg("rebalance-co-owned-249", OWNER_ID);
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
    mixedOrgId = await insertOrg("rebalance-mixed-249", OWNER_ID);
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
    soloOrgId = await insertOrg("rebalance-solo-249", OWNER_ID);

    // Org 4: untouched by the deletion, so the FK test below has a stable org.
    survivingOrgId = await insertOrg("rebalance-surviving-249", OUTSIDER_ID);

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

  it("hands an org with a co-owner to that co-owner", async () => {
    const org = await db
      .selectFrom("organizations")
      .select(["ownerUserId"])
      .where("id", "=", coOwnedOrgId)
      .executeTakeFirst();
    expect(org?.ownerUserId).toBe(CO_OWNER_ID);
  });

  it("moves only the pointer when a co-owner survives", async () => {
    // The co-owner already held the role, so the rebalance is a repoint and
    // nobody's role changes — the manager in particular is not promoted.
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
    const org = await db
      .selectFrom("organizations")
      .select(["ownerUserId"])
      .where("id", "=", mixedOrgId)
      .executeTakeFirst();
    expect(org?.ownerUserId).toBe(MANAGER_ID);

    const members = await db
      .selectFrom("organizationMembers")
      .select(["userId", "role"])
      .where("orgId", "=", mixedOrgId)
      .execute();
    expect(members.find((member) => member.userId === MANAGER_ID)?.role).toBe("owner");
    // The judge who joined earlier stays a judge: role rank beats join order.
    expect(members.find((member) => member.userId === JUDGE_ID)?.role).toBe("judge");
  });

  it("still cascade-deletes an org whose owner was the only member", async () => {
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
  });

  it("refuses an owner_user_id that is not a member", async () => {
    // Deferred, so this fails at commit rather than on the UPDATE itself.
    await expect(
      db.transaction().execute(async (trx) => {
        await trx
          .updateTable("organizations")
          .set({ ownerUserId: JUDGE_ID })
          .where("id", "=", survivingOrgId)
          .execute();
      }),
    ).rejects.toThrow();
  });
});
