import { describe, expect, it } from "vitest";

import { createTestContext, req } from "./test/integration-context.js";
import { readJson } from "./test/read-json.js";

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
const LIST_ID = "e1000000-0000-4000-a000-000000000e01";

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
  });

  describe("update", () => {
    it("PATCH /collections/:id returns 404 for another user's collection", async () => {
      await expectStatus("PATCH", `/collections/${COL_ID}`, 404, { name: "Hijacked" });
    });

    it("PATCH /decks/:id returns 404 for another user's deck", async () => {
      await expectStatus("PATCH", `/decks/${DECK_ID}`, 404, { name: "Hijacked" });
    });
  });

  describe("list only returns own resources", () => {
    it("GET /decks returns empty array (user has no decks)", async () => {
      const res = await app.fetch(req("GET", "/decks"));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json).toEqual({ items: [] });
    });
  });

  describe("Lists", () => {
    it("PATCH /lists/:id returns 404 for another user's list", async () => {
      await expectStatus("PATCH", `/lists/${LIST_ID}`, 404, { name: "Hijacked" });
    });

    it("DELETE /lists/:id returns 404 for another user's list", async () => {
      await expectStatus("DELETE", `/lists/${LIST_ID}`, 404);
    });

    it("GET /lists returns empty array (user has no lists)", async () => {
      const res = await app.fetch(req("GET", "/lists"));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json).toEqual({ items: [] });
    });
  });
});
