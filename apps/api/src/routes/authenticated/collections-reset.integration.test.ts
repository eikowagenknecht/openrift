import type { ResetCollectionsResponse } from "@openrift/shared/types/api/collection";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CARD_FURY_UNIT, PRINTING_1, PRINTING_2 } from "../../test/fixtures/constants.js";
import { createTestContext, req, seedTestUser } from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// Uses a throwaway random-UUID user, not a fixed registry one: reset wipes all of that user's collections.
const USER_ID = crypto.randomUUID();

const ctx = createTestContext(USER_ID);

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db.deleteFrom("lists").where("userId", "=", USER_ID).execute();
  await ctx.db
    .deleteFrom("copies")
    .where("collectionId", "in", (eb) =>
      eb.selectFrom("collections").select("id").where("userId", "=", USER_ID),
    )
    .execute();
  await ctx.db.deleteFrom("collections").where("userId", "=", USER_ID).execute();
  // Cascades the user's collection_events rows.
  await ctx.db.deleteFrom("users").where("id", "=", USER_ID).execute();
});

describe.skipIf(!ctx)("POST /collections/reset (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  let inboxId: string;
  let wishListId: string;
  let copyListId: string;
  let ruledListId: string;
  let untouchedListId: string;

  async function createList(
    name: string,
    intent: "wish" | "trade" | "organize",
    kind: "card" | "printing" | "copy",
  ): Promise<string> {
    const res = await app.fetch(req("POST", "/lists", { name, intent, kind }));
    expect(res.status).toBe(201);
    const json = (await readJson(res)) as { id: string };
    return json.id;
  }

  beforeAll(async () => {
    await seedTestUser(db, { id: USER_ID });

    const inbox = await db
      .insertInto("collections")
      .values({ userId: USER_ID, groupId: null, name: "Inbox", isInbox: true, sortOrder: 0 })
      .returningAll()
      .executeTakeFirstOrThrow();
    inboxId = inbox.id;
    const binder = await db
      .insertInto("collections")
      .values({ userId: USER_ID, groupId: null, name: "Binder", isInbox: false, sortOrder: 1 })
      .returningAll()
      .executeTakeFirstOrThrow();

    const copies = await db
      .insertInto("copies")
      .values([
        { collectionId: inbox.id, printingId: PRINTING_1.id },
        { collectionId: binder.id, printingId: PRINTING_1.id },
        { collectionId: binder.id, printingId: PRINTING_2.id },
      ])
      .returningAll()
      .execute();

    wishListId = await createList("Reset wish", "wish", "card");
    const wishEntry = await app.fetch(
      req("POST", `/lists/${wishListId}/entries`, { cardId: CARD_FURY_UNIT.id }),
    );
    expect(wishEntry.status).toBe(201);

    copyListId = await createList("Reset trade", "trade", "copy");
    for (const copy of copies.slice(0, 2)) {
      const entry = await app.fetch(
        req("POST", `/lists/${copyListId}/entries`, { copyId: copy.id }),
      );
      expect(entry.status).toBe(201);
    }

    ruledListId = await createList("Reset ruled trade", "trade", "copy");
    const ruledEntry = await app.fetch(
      req("POST", `/lists/${ruledListId}/entries`, { copyId: copies[2]!.id }),
    );
    expect(ruledEntry.status).toBe(201);
    await db
      .updateTable("lists")
      .set({
        rules: sql`'[{"kind":"trade","collectionIds":null,"keepPerCard":{"mode":"fixed","n":1},"excludeCopyIds":[]}]'::jsonb`,
      })
      .where("id", "=", ruledListId)
      .execute();

    untouchedListId = await createList("Reset untouched", "wish", "card");
  });

  it("wipes copies, keeps only the inbox, and prunes only wipe-emptied ruleless lists", async () => {
    const res = await app.fetch(req("POST", "/collections/reset"));
    expect(res.status).toBe(200);

    const json = (await readJson(res)) as ResetCollectionsResponse;
    expect(json.removedCopies).toBe(3);
    expect(json.removedCollections).toBe(1);
    expect(json.removedLists).toBe(1);

    const collections = await db
      .selectFrom("collections")
      .select(["id", "isInbox"])
      .where("userId", "=", USER_ID)
      .execute();
    expect(collections).toHaveLength(1);
    expect(collections[0]!.id).toBe(inboxId);
    expect(collections[0]!.isInbox).toBe(true);

    const copies = await db
      .selectFrom("copies")
      .select("id")
      .where("collectionId", "=", inboxId)
      .execute();
    expect(copies).toHaveLength(0);

    const listRows = await db
      .selectFrom("lists")
      .select("id")
      .where("userId", "=", USER_ID)
      .execute();
    const listIds = listRows.map((row) => row.id);
    expect(listIds).not.toContain(copyListId);
    expect(listIds).toContain(wishListId);
    expect(listIds).toContain(ruledListId);
    expect(listIds).toContain(untouchedListId);

    const events = await db
      .selectFrom("collectionEvents")
      .select(["action"])
      .where("userId", "=", USER_ID)
      .execute();
    expect(events.filter((event) => event.action === "removed")).toHaveLength(3);
  });

  it("is idempotent and recreates a missing inbox", async () => {
    // The previous test left only the (now empty) inbox — delete it to
    // simulate a user without one.
    await db.deleteFrom("collections").where("id", "=", inboxId).execute();

    const res = await app.fetch(req("POST", "/collections/reset"));
    expect(res.status).toBe(200);

    const json = (await readJson(res)) as ResetCollectionsResponse;
    expect(json.removedCopies).toBe(0);
    expect(json.removedCollections).toBe(0);
    expect(json.removedLists).toBe(0);

    const collections = await db
      .selectFrom("collections")
      .select("isInbox")
      .where("userId", "=", USER_ID)
      .execute();
    expect(collections).toHaveLength(1);
    expect(collections[0]!.isInbox).toBe(true);
  });
});
