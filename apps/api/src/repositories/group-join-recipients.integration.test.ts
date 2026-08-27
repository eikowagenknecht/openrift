import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { friendGroupsRepo } from "./friend-groups.js";
import { userPreferencesRepo } from "./user-preferences.js";

const OWNER_ID = crypto.randomUUID();
const ADMIN_ID = crypto.randomUUID();
const MEMBER_ID = crypto.randomUUID();
const OPTED_OUT_ID = crypto.randomUUID();
const UNVERIFIED_ID = crypto.randomUUID();

const USER_IDS = [OWNER_ID, ADMIN_ID, MEMBER_ID, OPTED_OUT_ID, UNVERIFIED_ID];

const ctx = createDbContext(OWNER_ID);

describe.skipIf(!ctx)("listGroupJoinRequestRecipients (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const groups = friendGroupsRepo(db);
  const preferences = userPreferencesRepo(db);

  let groupId = "";

  beforeAll(async () => {
    await seedTestUser(db, { id: OWNER_ID });
    await seedTestUser(db, { id: ADMIN_ID });
    await seedTestUser(db, { id: MEMBER_ID });
    await seedTestUser(db, { id: OPTED_OUT_ID });
    await seedTestUser(db, { id: UNVERIFIED_ID, emailVerified: false });

    const group = await groups.createWithOwner(
      {
        slug: `join-alerts-${Date.now().toString(36)}`,
        name: "Summoner Skirmish",
        description: null,
        code: null,
      },
      OWNER_ID,
    );
    groupId = group.id;
    await groups.addMember(groupId, ADMIN_ID, "admin");
    await groups.addMember(groupId, MEMBER_ID, "member");
    await groups.addMember(groupId, OPTED_OUT_ID, "admin");
    await groups.addMember(groupId, UNVERIFIED_ID, "admin");

    await preferences.upsert(OPTED_OUT_ID, { emailNotifications: { groupJoinRequests: false } });
    await preferences.upsert(ADMIN_ID, { emailNotifications: { tradeMatches: true } });
  });

  afterAll(async () => {
    if (groupId) {
      await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
    }
    await db.deleteFrom("userPreferences").where("userId", "in", USER_IDS).execute();
    await db.deleteFrom("users").where("id", "in", USER_IDS).execute();
  });

  it("includes owners and admins with no preferences row at all", async () => {
    const recipients = await preferences.listGroupJoinRequestRecipients(groupId);

    // OWNER_ID has never stored a preference; ADMIN_ID has one that says
    // nothing about this channel. Both are opted in by default.
    expect(recipients.map((row) => row.userId).toSorted()).toEqual([OWNER_ID, ADMIN_ID].toSorted());
  });

  it("drops plain members, explicit opt-outs, and unverified addresses", async () => {
    const recipients = await preferences.listGroupJoinRequestRecipients(groupId);
    const ids = recipients.map((row) => row.userId);

    expect(ids).not.toContain(MEMBER_ID);
    expect(ids).not.toContain(OPTED_OUT_ID);
    expect(ids).not.toContain(UNVERIFIED_ID);
  });

  it("stops mailing a demoted admin without touching their preference", async () => {
    await groups.updateRole(groupId, ADMIN_ID, "member");

    const recipients = await preferences.listGroupJoinRequestRecipients(groupId);

    expect(recipients.map((row) => row.userId)).toEqual([OWNER_ID]);
  });
});
