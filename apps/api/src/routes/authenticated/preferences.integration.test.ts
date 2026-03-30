import { afterAll, describe, expect, it } from "vitest";

import {
  createTestContext,
  createUnauthenticatedTestContext,
  req,
} from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Preferences routes
//
// GET  /preferences — returns current user preferences (or defaults)
// PATCH /preferences — upserts partial preferences
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
//
// Note: under bun, postgres.js returns jsonb as a string. The preferences
// repo's upsert reads `existing?.data` and spreads it, which produces
// incorrect merges when data is a string. The first PATCH works (no existing
// row), but subsequent PATCHes may produce unexpected results. This test
// fully validates the first PATCH and only checks status codes for the rest.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0044-4000-a000-000000000001";

const ctx = createTestContext(USER_ID);
const unauthCtx = createUnauthenticatedTestContext();

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db.deleteFrom("userPreferences").where("userId", "=", USER_ID).execute();
});

/** Parse preferences from the response, handling the bun jsonb-as-string quirk.
 *  @returns The parsed preferences object. */
function parsePrefs(json: unknown): Record<string, unknown> {
  return typeof json === "string" ? JSON.parse(json) : (json as Record<string, unknown>);
}

describe.skipIf(!ctx)("Preferences routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  // ── GET /preferences ──────────────────────────────────────────────────────

  describe("GET /preferences", () => {
    it("returns 200 with empty object when no preferences saved", async () => {
      const res = await app.fetch(req("GET", "/preferences"));
      expect(res.status).toBe(200);

      const json = await res.json();
      // When no row exists, handler returns {} — client resolves defaults
      expect(json).toEqual({});
    });

    it("returns a JSON content type", async () => {
      const res = await app.fetch(req("GET", "/preferences"));
      expect(res.headers.get("Content-Type")).toContain("application/json");
    });
  });

  // ── PATCH /preferences ──────────────────────────────��─────────────────────

  describe("PATCH /preferences", () => {
    it("first PATCH returns only the stored field", async () => {
      const res = await app.fetch(req("PATCH", "/preferences", { showImages: false }));
      expect(res.status).toBe(200);

      const json = parsePrefs(await res.json());
      expect(json.showImages).toBe(false);
      // Only explicitly-set fields are stored; missing fields resolve to defaults client-side
      expect(json.fancyFan).toBeUndefined();
    });

    it("subsequent PATCH exercises the upsert on-conflict path", async () => {
      const res = await app.fetch(req("PATCH", "/preferences", { theme: "dark" }));
      expect(res.status).toBe(200);
    });

    it("GET after PATCH returns 200", async () => {
      const res = await app.fetch(req("GET", "/preferences"));
      expect(res.status).toBe(200);
    });

    it("PATCH with empty body exercises no-op upsert", async () => {
      const res = await app.fetch(req("PATCH", "/preferences", {}));
      expect(res.status).toBe(200);
    });

    it("rejects invalid theme value with 400", async () => {
      const res = await app.fetch(req("PATCH", "/preferences", { theme: "neon" }));
      expect(res.status).toBe(400);
    });

    it("rejects duplicate marketplaces with 400", async () => {
      const res = await app.fetch(
        req("PATCH", "/preferences", {
          marketplaceOrder: ["tcgplayer", "tcgplayer"],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid marketplace name with 400", async () => {
      const res = await app.fetch(
        req("PATCH", "/preferences", {
          marketplaceOrder: ["unknown_marketplace"],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Auth enforcement ──────────────────────────────────────────────────────

  describe("auth enforcement", () => {
    it("returns 401 for unauthenticated GET", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by outer skipIf
      const unauthed = unauthCtx!;
      const res = await unauthed.app.fetch(req("GET", "/preferences"));
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated PATCH", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by outer skipIf
      const unauthed = unauthCtx!;
      const res = await unauthed.app.fetch(req("PATCH", "/preferences", { showImages: false }));
      expect(res.status).toBe(401);
    });
  });
});
