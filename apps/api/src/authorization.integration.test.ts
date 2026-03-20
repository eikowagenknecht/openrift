import { describe, expect, it } from "vitest";

import { createTestContext, req } from "./test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: CRUD factory user isolation
//
// Uses the shared integration database. Only auth is mocked.
// Requires INTEGRATION_DB_URL — excluded from `bun run test` by filename
// convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0001-4000-a000-000000000001");

const COL_ID = "c0000000-0000-4000-a000-0000000000c1";
const DECK_ID = "e0000000-0000-4000-a000-00000000de01";
const SRC_ID = "f0000000-0000-4000-a000-0000000000a1";
const WL_ID = "f1000000-0000-4000-a000-000000000f01";
const TL_ID = "e1000000-0000-4000-a000-000000000e01";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function expectStatus(method: string, path: string, expected: number, body?: unknown) {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const res = await ctx!.app.fetch(req(method, path, body));
  expect(res.status).toBe(expected);
  return res;
}

// ---------------------------------------------------------------------------
// Tests: user must NOT see other users' data (resources don't exist for this
// user, so all queries correctly return 404 / empty).
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("Authorization: user isolation — CRUD factory (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  describe("getOne", () => {
    it("GET /collections/:id returns 404 for another user's collection", async () => {
      await expectStatus("GET", `/collections/${COL_ID}`, 404);
    });

    it("GET /acquisition-sources/:id returns 404 for another user's source", async () => {
      await expectStatus("GET", `/acquisition-sources/${SRC_ID}`, 404);
    });
  });

  describe("update", () => {
    it("PATCH /collections/:id returns 404 for another user's collection", async () => {
      await expectStatus("PATCH", `/collections/${COL_ID}`, 404, { name: "Hijacked" });
    });

    it("PATCH /decks/:id returns 404 for another user's deck", async () => {
      await expectStatus("PATCH", `/decks/${DECK_ID}`, 404, { name: "Hijacked" });
    });

    it("PATCH /acquisition-sources/:id returns 404 for another user's source", async () => {
      await expectStatus("PATCH", `/acquisition-sources/${SRC_ID}`, 404, { name: "Hijacked" });
    });
  });

  describe("delete", () => {
    it("DELETE /acquisition-sources/:id returns 404 for another user's source", async () => {
      await expectStatus("DELETE", `/acquisition-sources/${SRC_ID}`, 404);
    });
  });

  describe("list only returns own resources", () => {
    it("GET /sources returns empty array (user has no sources)", async () => {
      const res = await app.fetch(req("GET", "/acquisition-sources"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });

    it("GET /decks returns empty array (user has no decks)", async () => {
      const res = await app.fetch(req("GET", "/decks"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });
  });

  describe("Wish Lists", () => {
    it("PATCH /wish-lists/:id returns 404 for another user's wish list", async () => {
      await expectStatus("PATCH", `/wish-lists/${WL_ID}`, 404, { name: "Hijacked" });
    });

    it("DELETE /wish-lists/:id returns 404 for another user's wish list", async () => {
      await expectStatus("DELETE", `/wish-lists/${WL_ID}`, 404);
    });

    it("GET /wish-lists returns empty array (user has no wish lists)", async () => {
      const res = await app.fetch(req("GET", "/wish-lists"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });
  });

  describe("Trade Lists", () => {
    it("PATCH /trade-lists/:id returns 404 for another user's trade list", async () => {
      await expectStatus("PATCH", `/trade-lists/${TL_ID}`, 404, { name: "Hijacked" });
    });

    it("DELETE /trade-lists/:id returns 404 for another user's trade list", async () => {
      await expectStatus("DELETE", `/trade-lists/${TL_ID}`, 404);
    });

    it("GET /trade-lists returns empty array (user has no trade lists)", async () => {
      const res = await app.fetch(req("GET", "/trade-lists"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });
  });
});
