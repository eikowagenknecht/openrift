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

  // Group ids are uuidv7, so their leading hex digits are the millisecond
  // timestamp: every group created in the same ~65s window shares a prefix.
  // Codes and guild ids must be derived from the whole id to stay unique.
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
      code: `code-${group.id}`,
      codeExpiresAt: futureExpiry(),
    });

    const result = await repo.redeemCode({
      code: `code-${group.id}`,
      guildId: `guild-${group.id}`,
      guildName: "Our TCG Server",
    });
    expect(result.status).toBe("linked");

    const links = await repo.listLinks(group.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      guildId: `guild-${group.id}`,
      guildName: "Our TCG Server",
      code: null,
      codeExpiresAt: null,
    });
    expect(links[0].linkedAt).not.toBeNull();

    const found = await repo.findByGuildId(`guild-${group.id}`);
    expect(found).toMatchObject({ groupId: group.id, groupName: "Test Group" });
  });

  it("rejects an expired code and a consumed one", async () => {
    const group = await createGroup();
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `expired-${group.id}`,
      codeExpiresAt: new Date(Date.now() - 1000),
    });
    expect(
      await repo.redeemCode({
        code: `expired-${group.id}`,
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
      code: `first-${group.id}`,
      codeExpiresAt: futureExpiry(),
    });
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `second-${group.id}`,
      codeExpiresAt: futureExpiry(),
    });
    expect(
      await repo.redeemCode({
        code: `first-${group.id}`,
        guildId: "guild-y",
        guildName: null,
      }),
    ).toEqual({ status: "unknown-code" });
    const result = await repo.redeemCode({
      code: `second-${group.id}`,
      guildId: `guild-${group.id}`,
      guildName: null,
    });
    expect(result.status).toBe("linked");
  });

  it("conflicts when the guild is already linked to another group, allows idempotent re-link", async () => {
    const groupA = await createGroup();
    const groupB = await createGroup();
    const guildId = `guild-${groupA.id}`;

    await repo.createPendingLink({
      groupId: groupA.id,
      createdByUserId: OWNER_ID,
      code: `a-${groupA.id}`,
      codeExpiresAt: futureExpiry(),
    });
    await repo.redeemCode({ code: `a-${groupA.id}`, guildId, guildName: "Old name" });

    // Another group's code for the same guild: conflict, code stays unspent.
    await repo.createPendingLink({
      groupId: groupB.id,
      createdByUserId: OWNER_ID,
      code: `b-${groupB.id}`,
      codeExpiresAt: futureExpiry(),
    });
    expect(await repo.redeemCode({ code: `b-${groupB.id}`, guildId, guildName: null })).toEqual({
      status: "guild-taken",
    });

    // Same group re-links the same guild: existing link kept, name refreshed.
    await repo.createPendingLink({
      groupId: groupA.id,
      createdByUserId: OWNER_ID,
      code: `a2-${groupA.id}`,
      codeExpiresAt: futureExpiry(),
    });
    const relink = await repo.redeemCode({
      code: `a2-${groupA.id}`,
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
      code: `del-${groupA.id}`,
      codeExpiresAt: futureExpiry(),
    });
    const redeemed = await repo.redeemCode({
      code: `del-${groupA.id}`,
      guildId: `guild-${groupA.id}`,
      guildName: null,
    });
    if (redeemed.status !== "linked") {
      throw new Error("expected linked");
    }

    expect(await repo.deleteLink(groupB.id, redeemed.link.id)).toBe(false);
    expect(await repo.deleteLink(groupA.id, redeemed.link.id)).toBe(true);
    expect(await repo.findByGuildId(`guild-${groupA.id}`)).toBeUndefined();
  });

  // Regression: the redeem ran as four statements on the bare db, so two
  // concurrent /link commands could both pass the pending check and bind two
  // guilds to a single one-time code. The FOR UPDATE lock inside the
  // transaction serializes them: the loser re-checks the qualifier once the
  // lock lifts, no longer matches, and reports unknown-code.
  it("lets only one of two concurrent redeems consume the code", async () => {
    const group = await createGroup();
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `race-${group.id}`,
      codeExpiresAt: futureExpiry(),
    });

    const outcomes = await Promise.all([
      repo.redeemCode({
        code: `race-${group.id}`,
        guildId: `guild-race-a-${group.id}`,
        guildName: "First",
      }),
      repo.redeemCode({
        code: `race-${group.id}`,
        guildId: `guild-race-b-${group.id}`,
        guildName: "Second",
      }),
    ]);

    const statuses = outcomes.map((outcome) => outcome.status).toSorted();
    expect(statuses).toEqual(["linked", "unknown-code"]);

    // Exactly one guild bound, and the code is gone.
    const links = await repo.listLinks(group.id);
    expect(links).toHaveLength(1);
    expect(links[0].code).toBeNull();
  });

  /**
   * Links a fresh group to a guild.
   *
   * @returns The linked guild id.
   */
  async function linkedGuild(prefix: string): Promise<string> {
    const group = await createGroup();
    const guildId = `guild-${prefix}-${group.id}`;
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `${prefix}-${group.id}`,
      codeExpiresAt: futureExpiry(),
    });
    await repo.redeemCode({ code: `${prefix}-${group.id}`, guildId, guildName: null });
    return guildId;
  }

  it("adds and removes trade channels idempotently", async () => {
    const guildId = await linkedGuild("tc");

    expect(await repo.setTradeChannel({ guildId, channelId: "chan-1", enabled: true })).toEqual([
      "chan-1",
    ]);
    // Adding the same channel twice must not duplicate it.
    expect(await repo.setTradeChannel({ guildId, channelId: "chan-1", enabled: true })).toEqual([
      "chan-1",
    ]);
    expect(await repo.setTradeChannel({ guildId, channelId: "chan-2", enabled: true })).toEqual([
      "chan-1",
      "chan-2",
    ]);
    expect(await repo.setTradeChannel({ guildId, channelId: "chan-1", enabled: false })).toEqual([
      "chan-2",
    ]);
    // Removing one that was never there is a no-op, not an error.
    expect(await repo.setTradeChannel({ guildId, channelId: "chan-9", enabled: false })).toEqual([
      "chan-2",
    ]);
  });

  it("reports no link rather than failing for an unlinked guild", async () => {
    expect(
      await repo.setTradeChannel({ guildId: "guild-never-linked", channelId: "c", enabled: true }),
    ).toBeNull();
  });

  it("lists only guilds that actually have trade channels", async () => {
    const withChannels = await linkedGuild("has");
    const withoutChannels = await linkedGuild("none");
    await repo.setTradeChannel({ guildId: withChannels, channelId: "chan-x", enabled: true });

    const listed = await repo.listTradeChannels();
    expect(listed.find((entry) => entry.guildId === withChannels)?.channelIds).toEqual(["chan-x"]);
    expect(listed.some((entry) => entry.guildId === withoutChannels)).toBe(false);
  });

  it("drops a guild from the list once its last channel is turned off", async () => {
    const guildId = await linkedGuild("drop");
    await repo.setTradeChannel({ guildId, channelId: "chan-only", enabled: true });
    await repo.setTradeChannel({ guildId, channelId: "chan-only", enabled: false });

    const listed = await repo.listTradeChannels();
    expect(listed.some((entry) => entry.guildId === guildId)).toBe(false);
  });

  it("cascades links away with the group", async () => {
    const group = await createGroup();
    await repo.createPendingLink({
      groupId: group.id,
      createdByUserId: OWNER_ID,
      code: `casc-${group.id}`,
      codeExpiresAt: futureExpiry(),
    });
    await repo.redeemCode({
      code: `casc-${group.id}`,
      guildId: `guild-casc-${group.id}`,
      guildName: null,
    });
    await db.deleteFrom("friendGroups").where("id", "=", group.id).execute();
    expect(await repo.findByGuildId(`guild-casc-${group.id}`)).toBeUndefined();
  });
});
