import { afterAll, describe, expect, it } from "vitest";

import { friendGroupsRepo } from "../../repositories/friend-groups.js";
import { CARD_FURY_UNIT, PRINTING_1 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Lists routes (kind-aware)
//
// Uses the shared integration database (INTEGRATION_DB_URL). Verifies the
// full request → repo → DB path, the intent×kind constraints, kind-matched
// entry inputs, the share flow, and intent filtering.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0041-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);

afterAll(async () => {
  if (!ctx) {
    return;
  }
  // lists cascade list_entries; copies need explicit cleanup. Copies have no
  // user_id column — they belong to a user via their collection, so scope the
  // delete to collections this user owns before removing the collections.
  await ctx.db.deleteFrom("lists").where("userId", "=", USER_ID).execute();
  await ctx.db
    .deleteFrom("copies")
    .where("collectionId", "in", (eb) =>
      eb.selectFrom("collections").select("id").where("userId", "=", USER_ID),
    )
    .execute();
  await ctx.db.deleteFrom("collections").where("userId", "=", USER_ID).execute();
});

describe.skipIf(!ctx)("Lists routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  async function createList(
    name: string,
    intent: "wish" | "trade" | "organize",
    kind: "card" | "printing" | "copy",
  ): Promise<string> {
    const res = await app.fetch(req("POST", "/lists", { name, intent, kind }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  async function createCopy(): Promise<string> {
    const collection = await db
      .insertInto("collections")
      .values({
        userId: USER_ID,
        name: `Test binder ${Date.now()}-${Math.random()}`,
        isInbox: false,
        sortOrder: 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const copy = await db
      .insertInto("copies")
      .values({
        collectionId: collection.id,
        printingId: PRINTING_1.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return copy.id;
  }

  // ── POST /lists ────────────────────────────────────────────────────────────

  describe("POST /lists", () => {
    it("creates a list for each allowed intent × kind combo", async () => {
      const combos = [
        { intent: "wish", kind: "card" },
        { intent: "wish", kind: "printing" },
        { intent: "trade", kind: "copy" },
        { intent: "organize", kind: "card" },
        { intent: "organize", kind: "printing" },
        { intent: "organize", kind: "copy" },
      ] as const;
      for (const { intent, kind } of combos) {
        const res = await app.fetch(
          req("POST", "/lists", { name: `New ${intent}/${kind}`, intent, kind }),
        );
        expect(res.status).toBe(201);
        const json = (await res.json()) as { intent: string; kind: string; isPublic: boolean };
        expect(json.intent).toBe(intent);
        expect(json.kind).toBe(kind);
        expect(json.isPublic).toBe(false);
      }
    });

    it("rejects wish + copy (disallowed combo)", async () => {
      const res = await app.fetch(
        req("POST", "/lists", { name: "Bad", intent: "wish", kind: "copy" }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects trade + card (disallowed combo)", async () => {
      const res = await app.fetch(
        req("POST", "/lists", { name: "Bad", intent: "trade", kind: "card" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 on missing kind", async () => {
      const res = await app.fetch(req("POST", "/lists", { name: "No kind", intent: "wish" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 on unknown intent", async () => {
      const res = await app.fetch(
        req("POST", "/lists", { name: "Bad", intent: "barter", kind: "card" }),
      );
      expect(res.status).toBe(400);
    });

    it("creates every new list private — no group is auto-shared (opt-in, ADR-013)", async () => {
      const repo = friendGroupsRepo(db);
      const group = await repo.createWithOwner(
        {
          slug: `lst-int-${Date.now().toString(36)}`,
          name: "Lists Integration Group",
          description: null,
          code: null,
        },
        USER_ID,
      );
      try {
        const wishId = await createList("Private wants", "wish", "card");
        const organizeId = await createList("Private binder", "organize", "card");

        const shares = await repo.listSharesForGroup(group.id);
        const sharedListIds = new Set(shares.map((row) => row.listId));
        expect(sharedListIds.has(wishId)).toBe(false);
        expect(sharedListIds.has(organizeId)).toBe(false);
      } finally {
        // Lists are cleaned in afterAll.
        await db.deleteFrom("friendGroups").where("id", "=", group.id).execute();
      }
    });
  });

  // ── GET /lists ─────────────────────────────────────────────────────────────

  describe("GET /lists", () => {
    it("returns all lists for the user", async () => {
      const res = await app.fetch(req("GET", "/lists"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { items: { intent: string; kind: string }[] };
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThanOrEqual(3);
      for (const item of json.items) {
        expect(["wish", "trade", "organize"]).toContain(item.intent);
        expect(["card", "printing", "copy"]).toContain(item.kind);
      }
    });

    it("filters by intent", async () => {
      const res = await app.fetch(req("GET", "/lists?intent=trade"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { items: { intent: string }[] };
      expect(json.items.every((l) => l.intent === "trade")).toBe(true);
    });
  });

  // ── PATCH /lists/:id ───────────────────────────────────────────────────────

  describe("PATCH /lists/:id", () => {
    it("renames a list", async () => {
      const id = await createList("Before", "wish", "card");
      const res = await app.fetch(req("PATCH", `/lists/${id}`, { name: "After" }));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { name: string };
      expect(json.name).toBe("After");
    });

    it("returns 404 for a list that doesn't exist", async () => {
      const res = await app.fetch(
        req("PATCH", `/lists/a0000000-9999-4000-a000-000000000099`, { name: "X" }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /lists/:id ──────────────────────────────────────────────────────

  describe("DELETE /lists/:id", () => {
    it("deletes a list and returns the txid", async () => {
      const id = await createList("Doomed", "organize", "card");
      const res = await app.fetch(req("DELETE", `/lists/${id}`));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { txid: number };
      expect(json.txid).toBeGreaterThan(0);
    });

    it("returns 404 when deleting a missing list", async () => {
      const res = await app.fetch(req("DELETE", `/lists/a0000000-9999-4000-a000-000000000099`));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /lists/:id/entries ────────────────────────────────────────────────

  describe("POST /lists/:id/entries", () => {
    it("adds a card-kind entry to a card-kind list", async () => {
      const id = await createList("Card entries", "wish", "card");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries`, { cardId: CARD_FURY_UNIT.id }),
      );
      expect(res.status).toBe(201);
      const json = (await res.json()) as { kind: string; cardId: string | null };
      expect(json.kind).toBe("card");
      expect(json.cardId).toBe(CARD_FURY_UNIT.id);
    });

    it("rejects a printing in a card-kind list", async () => {
      const id = await createList("Card list, printing input", "wish", "card");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries`, { printingId: PRINTING_1.id }),
      );
      expect(res.status).toBe(400);
    });

    it("adds a printing-kind entry to a printing-kind list", async () => {
      const id = await createList("Printing entries", "wish", "printing");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries`, { printingId: PRINTING_1.id, quantity: 2 }),
      );
      expect(res.status).toBe(201);
      const json = (await res.json()) as { quantity: number; kind: string };
      expect(json.kind).toBe("printing");
      expect(json.quantity).toBe(2);
    });

    it("adds a copy-kind entry only when the copy belongs to the user", async () => {
      const copyId = await createCopy();
      const id = await createList("Copy entries", "trade", "copy");
      const res = await app.fetch(req("POST", `/lists/${id}/entries`, { copyId }));
      expect(res.status).toBe(201);
    });

    it("returns 404 when the copyId is not owned by the caller", async () => {
      const id = await createList("Foreign copy", "trade", "copy");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries`, { copyId: "550e8400-e29b-41d4-a716-446655440099" }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 when no target is provided", async () => {
      const id = await createList("No target", "wish", "card");
      const res = await app.fetch(req("POST", `/lists/${id}/entries`, {}));
      expect(res.status).toBe(400);
    });
  });

  // ── POST /lists/:id/entries/bulk ───────────────────────────────────────────

  describe("POST /lists/:id/entries/bulk", () => {
    it("reports added/skipped for a copy-kind list", async () => {
      const copyId = await createCopy();
      const id = await createList("Bulk copy", "trade", "copy");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries/bulk`, {
          entries: [{ copyId }, { copyId: "550e8400-e29b-41d4-a716-446655440099" }],
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { added: number; skipped: number };
      expect(json.added).toBe(1);
      expect(json.skipped).toBe(1);
    });

    it("rejects a bulk batch with mixed targets when the list is single-kind", async () => {
      const id = await createList("Mixed", "wish", "card");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries/bulk`, {
          entries: [{ cardId: CARD_FURY_UNIT.id }, { printingId: PRINTING_1.id }],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── POST /lists/:id/entries/from-copies (drag-from-collections) ────────────

  describe("POST /lists/:id/entries/from-copies", () => {
    it("inserts copy entries on a copy-kind list", async () => {
      const copyId = await createCopy();
      const id = await createList("From-copies copy", "trade", "copy");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries/from-copies`, { copyIds: [copyId] }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { added: number; skipped: number };
      expect(json.added).toBe(1);
      expect(json.skipped).toBe(0);
    });

    it("derives a card entry from a copy on a card-kind list", async () => {
      const copyId = await createCopy();
      const id = await createList("From-copies card", "wish", "card");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries/from-copies`, { copyIds: [copyId] }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { added: number; skipped: number };
      expect(json.added).toBe(1);

      // Verify the entry landed as a card entry (not a copy entry).
      const detailRes = await app.fetch(req("GET", `/lists/${id}`));
      const detail = (await detailRes.json()) as { entries: { kind: string }[] };
      expect(detail.entries[0]?.kind).toBe("card");
    });

    it("treats non-owned copies as skipped", async () => {
      const id = await createList("Non-owned", "wish", "card");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries/from-copies`, {
          copyIds: ["550e8400-e29b-41d4-a716-446655440099"],
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { added: number; skipped: number };
      expect(json.added).toBe(0);
      expect(json.skipped).toBe(1);
    });
  });

  // ── POST /lists/:id/entries/move (drag-list-to-list) ──────────────────────

  describe("POST /lists/:id/entries/move", () => {
    it("moves a card entry between two same-kind same-intent lists", async () => {
      const source = await createList("Move source", "wish", "card");
      const dest = await createList("Move dest", "wish", "card");
      const createRes = await app.fetch(
        req("POST", `/lists/${source}/entries`, { cardId: CARD_FURY_UNIT.id, quantity: 3 }),
      );
      const created = (await createRes.json()) as { id: string };

      const moveRes = await app.fetch(
        req("POST", `/lists/${source}/entries/move`, {
          toListId: dest,
          entryIds: [created.id],
        }),
      );
      expect(moveRes.status).toBe(200);
      const moved = (await moveRes.json()) as { moved: number; merged: number };
      expect(moved).toEqual({ moved: 1, merged: 0 });

      const sourceRes = await app.fetch(req("GET", `/lists/${source}`));
      const sourceDetail = (await sourceRes.json()) as { entries: unknown[] };
      expect(sourceDetail.entries).toHaveLength(0);

      const destRes = await app.fetch(req("GET", `/lists/${dest}`));
      const destDetail = (await destRes.json()) as {
        entries: { kind: string; quantity: number }[];
      };
      expect(destDetail.entries).toHaveLength(1);
      expect(destDetail.entries[0]).toMatchObject({ kind: "card", quantity: 3 });
    });

    it("merges quantities when the destination already has an entry for the same card", async () => {
      const source = await createList("Move merge source", "wish", "card");
      const dest = await createList("Move merge dest", "wish", "card");
      await app.fetch(
        req("POST", `/lists/${dest}/entries`, { cardId: CARD_FURY_UNIT.id, quantity: 2 }),
      );
      const createRes = await app.fetch(
        req("POST", `/lists/${source}/entries`, { cardId: CARD_FURY_UNIT.id, quantity: 3 }),
      );
      const created = (await createRes.json()) as { id: string };

      const moveRes = await app.fetch(
        req("POST", `/lists/${source}/entries/move`, {
          toListId: dest,
          entryIds: [created.id],
        }),
      );
      expect(moveRes.status).toBe(200);
      expect(await moveRes.json()).toEqual({ moved: 1, merged: 1 });

      const destRes = await app.fetch(req("GET", `/lists/${dest}`));
      const destDetail = (await destRes.json()) as { entries: { quantity: number }[] };
      expect(destDetail.entries).toHaveLength(1);
      expect(destDetail.entries[0]?.quantity).toBe(5);
    });

    it("rejects moves to a different kind", async () => {
      const source = await createList("Kind source", "wish", "card");
      const dest = await createList("Kind dest", "wish", "printing");
      const createRes = await app.fetch(
        req("POST", `/lists/${source}/entries`, { cardId: CARD_FURY_UNIT.id }),
      );
      const created = (await createRes.json()) as { id: string };

      const res = await app.fetch(
        req("POST", `/lists/${source}/entries/move`, {
          toListId: dest,
          entryIds: [created.id],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects moves to a different intent", async () => {
      // Same kind (card), different intent (wish vs organize) — both are
      // allowed intent/kind combos, but the move must be rejected because the
      // intents differ. (trade+card is itself a disallowed combo, so it can't
      // be used as the destination here.)
      const source = await createList("Intent source", "wish", "card");
      const dest = await createList("Intent dest", "organize", "card");
      const createRes = await app.fetch(
        req("POST", `/lists/${source}/entries`, { cardId: CARD_FURY_UNIT.id }),
      );
      const created = (await createRes.json()) as { id: string };

      const res = await app.fetch(
        req("POST", `/lists/${source}/entries/move`, {
          toListId: dest,
          entryIds: [created.id],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects moves where source and destination are the same list", async () => {
      const list = await createList("Self move", "wish", "card");
      const createRes = await app.fetch(
        req("POST", `/lists/${list}/entries`, { cardId: CARD_FURY_UNIT.id }),
      );
      const created = (await createRes.json()) as { id: string };

      const res = await app.fetch(
        req("POST", `/lists/${list}/entries/move`, {
          toListId: list,
          entryIds: [created.id],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /lists/:id (with enriched entries) ─────────────────────────────────

  describe("GET /lists/:id", () => {
    it("returns the list (with kind) and enriched entries", async () => {
      const id = await createList("Detail", "wish", "card");
      await app.fetch(req("POST", `/lists/${id}/entries`, { cardId: CARD_FURY_UNIT.id }));
      const res = await app.fetch(req("GET", `/lists/${id}`));
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        list: { id: string; kind: string };
        entries: { kind: string; cardName: string }[];
      };
      expect(json.list.id).toBe(id);
      expect(json.list.kind).toBe("card");
      expect(json.entries).toHaveLength(1);
      expect(json.entries[0]?.kind).toBe("card");
      expect(json.entries[0]?.cardName.length).toBeGreaterThan(0);
    });
  });

  // ── PATCH/DELETE entry ─────────────────────────────────────────────────────

  describe("PATCH/DELETE /lists/:id/entries/:itemId", () => {
    it("updates the quantity and then deletes the entry", async () => {
      const id = await createList("Entry ops", "wish", "card");
      const createRes = await app.fetch(
        req("POST", `/lists/${id}/entries`, { cardId: CARD_FURY_UNIT.id }),
      );
      const created = (await createRes.json()) as { id: string };

      const patchRes = await app.fetch(
        req("PATCH", `/lists/${id}/entries/${created.id}`, { quantity: 4 }),
      );
      expect(patchRes.status).toBe(200);
      const patched = (await patchRes.json()) as { quantity: number };
      expect(patched.quantity).toBe(4);

      const deleteRes = await app.fetch(req("DELETE", `/lists/${id}/entries/${created.id}`));
      expect(deleteRes.status).toBe(200);
      const deleted = (await deleteRes.json()) as { txid: number };
      expect(deleted.txid).toBeGreaterThan(0);
    });
  });

  // ── Sharing ────────────────────────────────────────────────────────────────

  describe("Share flow", () => {
    it("share generates a token and flips isPublic; unshare clears both", async () => {
      const id = await createList("Shareable", "organize", "card");

      const shareRes = await app.fetch(req("POST", `/lists/${id}/share`));
      expect(shareRes.status).toBe(200);
      const shareBody = (await shareRes.json()) as { shareToken: string; isPublic: boolean };
      expect(shareBody.isPublic).toBe(true);
      expect(shareBody.shareToken.length).toBeGreaterThan(0);

      const publicRes = await app.fetch(req("GET", `/lists/share/${shareBody.shareToken}`));
      expect(publicRes.status).toBe(200);
      const publicBody = (await publicRes.json()) as { list: { kind: string } };
      expect(publicBody.list.kind).toBe("card");

      const unshareRes = await app.fetch(req("DELETE", `/lists/${id}/share`));
      expect(unshareRes.status).toBe(204);

      const after = await app.fetch(req("GET", `/lists/share/${shareBody.shareToken}`));
      expect(after.status).toBe(404);
    });

    it("re-sharing an already-shared list is idempotent (same token, no churn)", async () => {
      const id = await createList("Idempotent share", "organize", "card");

      const first = await app.fetch(req("POST", `/lists/${id}/share`));
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { shareToken: string; isPublic: boolean };
      expect(firstBody.shareToken.length).toBeGreaterThan(0);
      expect(firstBody.isPublic).toBe(true);

      const second = await app.fetch(req("POST", `/lists/${id}/share`));
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { shareToken: string; isPublic: boolean };
      // Same token returned — POST /share must not rotate.
      expect(secondBody.shareToken).toBe(firstBody.shareToken);
      expect(secondBody.isPublic).toBe(true);

      // The original token still resolves after the second share call.
      const publicRes = await app.fetch(req("GET", `/lists/share/${firstBody.shareToken}`));
      expect(publicRes.status).toBe(200);
    });

    it("GET /share reflects unshared then shared state for an owned list", async () => {
      const id = await createList("Share state", "organize", "card");

      // Owned but unshared → token null, not a 404.
      const unshared = await app.fetch(req("GET", `/lists/${id}/share`));
      expect(unshared.status).toBe(200);
      const unsharedBody = (await unshared.json()) as {
        shareToken: string | null;
        isPublic: boolean;
      };
      expect(unsharedBody.shareToken).toBeNull();
      expect(unsharedBody.isPublic).toBe(false);

      const shareRes = await app.fetch(req("POST", `/lists/${id}/share`));
      const shareBody = (await shareRes.json()) as { shareToken: string };

      const shared = await app.fetch(req("GET", `/lists/${id}/share`));
      expect(shared.status).toBe(200);
      const sharedBody = (await shared.json()) as { shareToken: string; isPublic: boolean };
      expect(sharedBody.shareToken).toBe(shareBody.shareToken);
      expect(sharedBody.isPublic).toBe(true);
    });

    it("GET /share 404s for a list the caller doesn't own", async () => {
      // A random list id that doesn't belong to USER_ID.
      const res = await app.fetch(req("GET", `/lists/${USER_ID}/share`));
      expect(res.status).toBe(404);
    });

    it("rotate mints a new token; the old token stops resolving", async () => {
      const id = await createList("Rotatable", "organize", "card");

      const shareRes = await app.fetch(req("POST", `/lists/${id}/share`));
      const shareBody = (await shareRes.json()) as { shareToken: string };
      const oldToken = shareBody.shareToken;

      // The old token resolves before rotation.
      const before = await app.fetch(req("GET", `/lists/share/${oldToken}`));
      expect(before.status).toBe(200);

      const rotateRes = await app.fetch(req("POST", `/lists/${id}/share/rotate`));
      expect(rotateRes.status).toBe(200);
      const rotateBody = (await rotateRes.json()) as { shareToken: string; isPublic: boolean };
      expect(rotateBody.shareToken.length).toBeGreaterThan(0);
      expect(rotateBody.shareToken).not.toBe(oldToken);
      expect(rotateBody.isPublic).toBe(true);

      // Old token stops resolving; the new token resolves.
      const oldAfter = await app.fetch(req("GET", `/lists/share/${oldToken}`));
      expect(oldAfter.status).toBe(404);
      const newAfter = await app.fetch(req("GET", `/lists/share/${rotateBody.shareToken}`));
      expect(newAfter.status).toBe(200);

      // GET /share now reflects the rotated token.
      const state = await app.fetch(req("GET", `/lists/${id}/share`));
      const stateBody = (await state.json()) as { shareToken: string };
      expect(stateBody.shareToken).toBe(rotateBody.shareToken);
    });

    it("rotate on an unshared list shares it (mints a token)", async () => {
      const id = await createList("Rotate-then-share", "organize", "card");

      const rotateRes = await app.fetch(req("POST", `/lists/${id}/share/rotate`));
      expect(rotateRes.status).toBe(200);
      const rotateBody = (await rotateRes.json()) as { shareToken: string; isPublic: boolean };
      expect(rotateBody.shareToken.length).toBeGreaterThan(0);
      expect(rotateBody.isPublic).toBe(true);

      const publicRes = await app.fetch(req("GET", `/lists/share/${rotateBody.shareToken}`));
      expect(publicRes.status).toBe(200);
    });
  });

  // ── Reliability hardening (F6/F7) ──────────────────────────────────────────

  describe("reliability hardening", () => {
    it("strips trade prefs from a PATCH on an organize list instead of 500ing (F6)", async () => {
      const id = await createList("Organize F6", "organize", "card");
      const res = await app.fetch(
        req("PATCH", `/lists/${id}`, {
          name: "Organize F6 renamed",
          tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
        }),
      );
      expect(res.status).toBe(200);
      const row = await db
        .selectFrom("lists")
        .select(["name", "defaultPricePref"])
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
      expect(row.name).toBe("Organize F6 renamed");
      expect(row.defaultPricePref).toBeNull();
    });

    it("returns 409 (not 500) on a duplicate single entry add (F7)", async () => {
      const id = await createList("Dup F7", "wish", "card");
      const body = { cardId: CARD_FURY_UNIT.id };
      const first = await app.fetch(req("POST", `/lists/${id}/entries`, body));
      expect(first.status).toBe(201);
      const second = await app.fetch(req("POST", `/lists/${id}/entries`, body));
      expect(second.status).toBe(409);
    });
  });
});
