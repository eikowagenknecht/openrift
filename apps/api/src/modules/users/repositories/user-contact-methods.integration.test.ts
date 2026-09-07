import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../../../test/integration-context.js";
import { friendGroupsRepo } from "../../groups/repositories/friend-groups.js";
import { userContactMethodsRepo } from "./user-contact-methods.js";

const ctx = createDbContext("a0000000-0056-4000-a000-000000000001");
const GROUP_ID = "a0000000-c100-4000-a000-000000000001";

describe.skipIf(!ctx)("userContactMethodsRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = userContactMethodsRepo(db);
  const groups = friendGroupsRepo(db);

  afterAll(async () => {
    await db.deleteFrom("friendGroups").where("id", "=", GROUP_ID).execute();
    await db.deleteFrom("userContactMethods").where("userId", "=", userId).execute();
  });

  it("starts empty and creates methods in insertion order", async () => {
    expect(await repo.listForUser(userId)).toEqual([]);

    const discord = await repo.create(userId, "discord", "seb#1234");
    const email = await repo.create(userId, "email", "seb@example.com");

    expect(discord.type).toBe("discord");
    const list = await repo.listForUser(userId);
    expect(list.map((method) => method.id)).toEqual([discord.id, email.id]);
  });

  it("updates a method in place, scoped to the owner", async () => {
    const [first] = await repo.listForUser(userId);
    const updated = await repo.update(first!.id, userId, "discord", "seb#5678");
    expect(updated?.value).toBe("seb#5678");

    const foreign = await repo.update(
      first!.id,
      "a0000000-0057-4000-a000-000000000001",
      "phone",
      "x",
    );
    expect(foreign).toBeUndefined();
  });

  it("reorders to match the given id list", async () => {
    const before = await repo.listForUser(userId);
    const reversedIds = before.map((method) => method.id).toReversed();
    await repo.reorder(userId, reversedIds);
    const after = await repo.listForUser(userId);
    expect(after.map((method) => method.id)).toEqual(reversedIds);
  });

  it("reveals only owned methods to a group and reads them back", async () => {
    await db
      .insertInto("friendGroups")
      .values({ id: GROUP_ID, slug: "contact-test-grp", name: "Contact Test" })
      .execute();
    await groups.addMember(GROUP_ID, userId, "owner");

    const methods = await repo.listForUser(userId);
    const revealedId = methods[0]!.id;

    await groups.setRevealedContacts(GROUP_ID, userId, [
      revealedId,
      "a0000000-dead-4000-a000-000000000001",
    ]);

    const byUser = await groups.getRevealedContactsForMembers(GROUP_ID);
    expect(byUser.get(userId)?.map((method) => method.id)).toEqual([revealedId]);

    await groups.setRevealedContacts(GROUP_ID, userId, []);
    const cleared = await groups.getRevealedContactsForMembers(GROUP_ID);
    expect(cleared.get(userId)).toBeUndefined();
  });

  it("deletes a method, scoped to the owner", async () => {
    const list = await repo.listForUser(userId);
    expect(await repo.delete(list[0]!.id, "a0000000-0057-4000-a000-000000000001")).toBe(false);
    expect(await repo.delete(list[0]!.id, userId)).toBe(true);
    const remaining = await repo.listForUser(userId);
    expect(remaining.some((method) => method.id === list[0]!.id)).toBe(false);
  });
});
