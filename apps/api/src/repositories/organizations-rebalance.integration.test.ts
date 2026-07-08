import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";

// Migration 188 invariants: deleting a user account must rebalance the
// organizations they own to the best surviving member (owner > manager >
// judge, oldest first) instead of cascading the org away. Only a memberless
// org dies with its owner.
//
// Random per-file users (seeded via seedTestUser in beforeAll) so this file
// cannot collide with pre-seeded registry users or other files' fixtures.
const OWNER_ID = crypto.randomUUID();
const CO_OWNER_ID = crypto.randomUUID();
const MANAGER_ID = crypto.randomUUID();
const ctx = createDbContext(OWNER_ID);

describe.skipIf(!ctx)("organization owner rebalance on user deletion (integration)", () => {
  const { db } = ctx!;
  let coOwnedOrgId: string;
  let managedOrgId: string;
  let soloOrgId: string;

  beforeAll(async () => {
    await seedTestUser(db, { id: OWNER_ID });
    await seedTestUser(db, { id: CO_OWNER_ID });
    await seedTestUser(db, { id: MANAGER_ID });

    const insertOrg = async (slug: string) => {
      const org = await db
        .insertInto("organizations")
        .values({ slug, name: "Rebalance Test LGS", ownerUserId: OWNER_ID })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .insertInto("organizationMembers")
        .values({
          orgId: org.id,
          userId: OWNER_ID,
          role: "owner",
          joinedAt: new Date("2026-01-01T00:00:00Z"),
        })
        .execute();
      return org.id;
    };

    // Org 1: has a co-owner (joined after the owner) and a manager.
    coOwnedOrgId = await insertOrg("rebalance-co-owned-188");
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

    // Org 2: only a manager besides the owner.
    managedOrgId = await insertOrg("rebalance-managed-188");
    await db
      .insertInto("organizationMembers")
      .values({
        orgId: managedOrgId,
        userId: MANAGER_ID,
        role: "manager",
        joinedAt: new Date("2026-02-01T00:00:00Z"),
      })
      .execute();

    // Org 3: the owner is the only member.
    soloOrgId = await insertOrg("rebalance-solo-188");

    await db.deleteFrom("users").where("id", "=", OWNER_ID).execute();
  });

  afterAll(async () => {
    await db
      .deleteFrom("organizations")
      .where("id", "in", [coOwnedOrgId, managedOrgId, soloOrgId])
      .execute();
    await db.deleteFrom("users").where("id", "in", [CO_OWNER_ID, MANAGER_ID]).execute();
  });

  it("hands an org with a co-owner to that co-owner", async () => {
    const org = await db
      .selectFrom("organizations")
      .select(["ownerUserId"])
      .where("id", "=", coOwnedOrgId)
      .executeTakeFirst();
    expect(org?.ownerUserId).toBe(CO_OWNER_ID);
  });

  it("keeps the surviving memberships of a rebalanced org", async () => {
    const members = await db
      .selectFrom("organizationMembers")
      .select(["userId", "role"])
      .where("orgId", "=", coOwnedOrgId)
      .execute();
    expect(members).toHaveLength(2);
    expect(members.find((member) => member.userId === MANAGER_ID)?.role).toBe("manager");
  });

  it("promotes a manager to owner when no co-owner exists", async () => {
    const org = await db
      .selectFrom("organizations")
      .select(["ownerUserId"])
      .where("id", "=", managedOrgId)
      .executeTakeFirst();
    expect(org?.ownerUserId).toBe(MANAGER_ID);

    const membership = await db
      .selectFrom("organizationMembers")
      .select(["role"])
      .where("orgId", "=", managedOrgId)
      .where("userId", "=", MANAGER_ID)
      .executeTakeFirst();
    expect(membership?.role).toBe("owner");
  });

  it("still cascade-deletes an org whose owner was the only member", async () => {
    const org = await db
      .selectFrom("organizations")
      .select(["id"])
      .where("id", "=", soloOrgId)
      .executeTakeFirst();
    expect(org).toBeUndefined();
  });
});
