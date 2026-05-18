import { afterAll, describe, expect, it } from "vitest";

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
  // lists cascade list_entries; copies need explicit cleanup.
  await ctx.db.deleteFrom("lists").where("userId", "=", USER_ID).execute();
  await ctx.db.deleteFrom("copies").where("userId", "=", USER_ID).execute();
  await ctx.db.deleteFrom("collections").where("userId", "=", USER_ID).execute();
});

describe.skipIf(!ctx)("Lists routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  async function createList(
    name: string,
    intent: "buy" | "sell" | "organize",
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
        availableForDeckbuilding: true,
        isInbox: false,
        sortOrder: 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const copy = await db
      .insertInto("copies")
      .values({
        userId: USER_ID,
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
        { intent: "buy", kind: "card" },
        { intent: "buy", kind: "printing" },
        { intent: "sell", kind: "copy" },
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

    it("rejects buy + copy (disallowed combo)", async () => {
      const res = await app.fetch(
        req("POST", "/lists", { name: "Bad", intent: "buy", kind: "copy" }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects sell + card (disallowed combo)", async () => {
      const res = await app.fetch(
        req("POST", "/lists", { name: "Bad", intent: "sell", kind: "card" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 on missing kind", async () => {
      const res = await app.fetch(req("POST", "/lists", { name: "No kind", intent: "buy" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 on unknown intent", async () => {
      const res = await app.fetch(
        req("POST", "/lists", { name: "Bad", intent: "barter", kind: "card" }),
      );
      expect(res.status).toBe(400);
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
        expect(["buy", "sell", "organize"]).toContain(item.intent);
        expect(["card", "printing", "copy"]).toContain(item.kind);
      }
    });

    it("filters by intent", async () => {
      const res = await app.fetch(req("GET", "/lists?intent=sell"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { items: { intent: string }[] };
      expect(json.items.every((l) => l.intent === "sell")).toBe(true);
    });
  });

  // ── PATCH /lists/:id ───────────────────────────────────────────────────────

  describe("PATCH /lists/:id", () => {
    it("renames a list", async () => {
      const id = await createList("Before", "buy", "card");
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
    it("deletes a list", async () => {
      const id = await createList("Doomed", "organize", "card");
      const res = await app.fetch(req("DELETE", `/lists/${id}`));
      expect(res.status).toBe(204);
    });

    it("returns 404 when deleting a missing list", async () => {
      const res = await app.fetch(req("DELETE", `/lists/a0000000-9999-4000-a000-000000000099`));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /lists/:id/entries ────────────────────────────────────────────────

  describe("POST /lists/:id/entries", () => {
    it("adds a card-kind entry to a card-kind list", async () => {
      const id = await createList("Card entries", "buy", "card");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries`, { cardId: CARD_FURY_UNIT.id }),
      );
      expect(res.status).toBe(201);
      const json = (await res.json()) as { kind: string; cardId: string | null };
      expect(json.kind).toBe("card");
      expect(json.cardId).toBe(CARD_FURY_UNIT.id);
    });

    it("rejects a printing in a card-kind list", async () => {
      const id = await createList("Card list, printing input", "buy", "card");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries`, { printingId: PRINTING_1.id }),
      );
      expect(res.status).toBe(400);
    });

    it("adds a printing-kind entry to a printing-kind list", async () => {
      const id = await createList("Printing entries", "buy", "printing");
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
      const id = await createList("Copy entries", "sell", "copy");
      const res = await app.fetch(req("POST", `/lists/${id}/entries`, { copyId }));
      expect(res.status).toBe(201);
    });

    it("returns 404 when the copyId is not owned by the caller", async () => {
      const id = await createList("Foreign copy", "sell", "copy");
      const res = await app.fetch(
        req("POST", `/lists/${id}/entries`, { copyId: "550e8400-e29b-41d4-a716-446655440099" }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 when no target is provided", async () => {
      const id = await createList("No target", "buy", "card");
      const res = await app.fetch(req("POST", `/lists/${id}/entries`, {}));
      expect(res.status).toBe(400);
    });
  });

  // ── POST /lists/:id/entries/bulk ───────────────────────────────────────────

  describe("POST /lists/:id/entries/bulk", () => {
    it("reports added/skipped for a copy-kind list", async () => {
      const copyId = await createCopy();
      const id = await createList("Bulk copy", "sell", "copy");
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
      const id = await createList("Mixed", "buy", "card");
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
      const id = await createList("From-copies copy", "sell", "copy");
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
      const id = await createList("From-copies card", "buy", "card");
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
      const id = await createList("Non-owned", "buy", "card");
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

  // ── GET /lists/:id (with enriched entries) ─────────────────────────────────

  describe("GET /lists/:id", () => {
    it("returns the list (with kind) and enriched entries", async () => {
      const id = await createList("Detail", "buy", "card");
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
      const id = await createList("Entry ops", "buy", "card");
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
      expect(deleteRes.status).toBe(204);
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
  });
});
