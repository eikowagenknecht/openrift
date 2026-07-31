import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { friendGroupDiscordLinksRepo } from "./friend-group-discord-links.js";
import { friendGroupsRepo } from "./friend-groups.js";

const OWNER_ID = crypto.randomUUID();

const ctx = createDbContext(OWNER_ID);

describe.skipIf(!ctx)("friendGroupDiscordLinksRepo (integration)", () => {
  const { db } = ctx!;
  const repo = friendGroupDiscordLinksRepo(db);
  const groups = friendGroupsRepo(db);

  const createdGroupIds: string[] = [];

  beforeAll(async () => {
    await seedTestUser(db, { id: OWNER_ID });
  });

  afterAll(async () => {
    // Links cascade with their group.
    if (createdGroupIds.length > 0) {
      await db.deleteFrom("friendGroups").where("id", "in", createdGroupIds).execute();
    }
    await db.deleteFrom("users").where("id", "=", OWNER_ID).execute();
  });

  function uniqueSlug(): string {
    return `fgdl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  async function createGroup() {
    const group = await groups.createWithOwner(
      { slug: uniqueSlug(), name: "Test Group", description: null, code: null },
      OWNER_ID,
    );
    createdGroupIds.push(group.id);
    return group;
  }

  function futureExpiry(): Date {
    return new Date(Date.now() + 15 * 60 * 1000);
  }

  it("creates a pending link and redeems it into a live guild link", async () => {
    const group = await createGroup();
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `code-${group.id.slice(0, 8)}`,
      codeExpiresAt: futureExpiry(),
    });

    const result = await repo.redeemCode({
      code: `code-${group.id.slice(0, 8)}`,
      guildId: `guild-${group.id.slice(0, 8)}`,
      guildName: "Our TCG Server",
    });
    expect(result.status).toBe("linked");

    const links = await repo.listLinks(group.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      guildId: `guild-${group.id.slice(0, 8)}`,
      guildName: "Our TCG Server",
      code: null,
      codeExpiresAt: null,
    });
    expect(links[0].linkedAt).not.toBeNull();

    const found = await repo.findByGuildId(`guild-${group.id.slice(0, 8)}`);
    expect(found).toMatchObject({ groupId: group.id, groupName: "Test Group" });
  });

  it("rejects an expired code and a consumed one", async () => {
    const group = await createGroup();
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `expired-${group.id.slice(0, 8)}`,
      codeExpiresAt: new Date(Date.now() - 1000),
    });
    expect(
      await repo.redeemCode({
        code: `expired-${group.id.slice(0, 8)}`,
        guildId: "guild-x",
        guildName: null,
      }),
    ).toEqual({ status: "unknown-code" });
    expect(
      await repo.redeemCode({ code: "never-existed", guildId: "guild-x", guildName: null }),
    ).toEqual({ status: "unknown-code" });
  });

  it("replaces the previous pending code on regenerate", async () => {
    const group = await createGroup();
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `first-${group.id.slice(0, 8)}`,
      codeExpiresAt: futureExpiry(),
    });
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `second-${group.id.slice(0, 8)}`,
      codeExpiresAt: futureExpiry(),
    });
    expect(
      await repo.redeemCode({
        code: `first-${group.id.slice(0, 8)}`,
        guildId: "guild-y",
        guildName: null,
      }),
    ).toEqual({ status: "unknown-code" });
    const result = await repo.redeemCode({
      code: `second-${group.id.slice(0, 8)}`,
      guildId: `guild-${group.id.slice(0, 8)}`,
      guildName: null,
    });
    expect(result.status).toBe("linked");
  });

  it("conflicts when the guild is already linked to another group, allows idempotent re-link", async () => {
    const groupA = await createGroup();
    const groupB = await createGroup();
    const guildId = `guild-${groupA.id.slice(0, 8)}`;

    await repo.createPendingLink({
      groupId: groupA.id,
      createdByUserId: OWNER_ID,
      code: `a-${groupA.id.slice(0, 8)}`,
      codeExpiresAt: futureExpiry(),
    });
    await repo.redeemCode({ code: `a-${groupA.id.slice(0, 8)}`, guildId, guildName: "Old name" });

    // Another group's code for the same guild: conflict, code stays unspent.
    await repo.createPendingLink({
      groupId: groupB.id,
      createdByUserId: OWNER_ID,
      code: `b-${groupB.id.slice(0, 8)}`,
      codeExpiresAt: futureExpiry(),
    });
    expect(
      await repo.redeemCode({ code: `b-${groupB.id.slice(0, 8)}`, guildId, guildName: null }),
    ).toEqual({ status: "guild-taken" });

    // Same group re-links the same guild: existing link kept, name refreshed.
    await repo.createPendingLink({
      groupId: groupA.id,
      createdByUserId: OWNER_ID,
      code: `a2-${groupA.id.slice(0, 8)}`,
      codeExpiresAt: futureExpiry(),
    });
    const relink = await repo.redeemCode({
      code: `a2-${groupA.id.slice(0, 8)}`,
      guildId,
      guildName: "New name",
    });
    expect(relink.status).toBe("linked");
    const links = await repo.listLinks(groupA.id);
    expect(links).toHaveLength(1);
    expect(links[0].guildName).toBe("New name");
  });

  it("deletes a link only within its own group", async () => {
    const groupA = await createGroup();
    const groupB = await createGroup();
    await repo.createPendingLink({
      groupId: groupA.id,
      createdByUserId: OWNER_ID,
      code: `del-${groupA.id.slice(0, 8)}`,
      codeExpiresAt: futureExpiry(),
    });
    const redeemed = await repo.redeemCode({
      code: `del-${groupA.id.slice(0, 8)}`,
      guildId: `guild-${groupA.id.slice(0, 8)}`,
      guildName: null,
    });
    if (redeemed.status !== "linked") {
      throw new Error("expected linked");
    }

    expect(await repo.deleteLink(groupB.id, redeemed.link.id)).toBe(false);
    expect(await repo.deleteLink(groupA.id, redeemed.link.id)).toBe(true);
    expect(await repo.findByGuildId(`guild-${groupA.id.slice(0, 8)}`)).toBeUndefined();
  });

  it("cascades links away with the group", async () => {
    const group = await createGroup();
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `casc-${group.id.slice(0, 8)}`,
      codeExpiresAt: futureExpiry(),
    });
    await repo.redeemCode({
      code: `casc-${group.id.slice(0, 8)}`,
      guildId: `guild-casc-${group.id.slice(0, 8)}`,
      guildName: null,
    });
    await db.deleteFrom("friendGroups").where("id", "=", group.id).execute();
    expect(await repo.findByGuildId(`guild-casc-${group.id.slice(0, 8)}`)).toBeUndefined();
  });
});
