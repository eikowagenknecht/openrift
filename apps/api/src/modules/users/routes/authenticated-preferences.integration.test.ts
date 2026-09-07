import { afterAll, describe, expect, it } from "vitest";

import {
  createTestContext,
  createUnauthenticatedTestContext,
  req,
} from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const USER_ID = "a0000000-0044-4000-a000-000000000001";
// Dedicated user so the emailNotifications round-trip runs as a clean first PATCH.
const EMAIL_PREF_USER_ID = "a0000000-0044-4000-a000-000000000002";

const ctx = createTestContext(USER_ID);
const emailPrefCtx = createTestContext(EMAIL_PREF_USER_ID);
const unauthCtx = createUnauthenticatedTestContext();

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db
    .deleteFrom("userPreferences")
    .where("userId", "in", [USER_ID, EMAIL_PREF_USER_ID])
    .execute();
});

/** Parses preferences from the response, handling the bun jsonb-as-string quirk. */
function parsePrefs(json: unknown): Record<string, unknown> {
  return typeof json === "string" ? JSON.parse(json) : (json as Record<string, unknown>);
}

describe.skipIf(!ctx)("Preferences routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  describe("GET /preferences", () => {
    it("returns 200 with empty object when no preferences saved", async () => {
      const res = await app.fetch(req("GET", "/preferences"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toEqual({});
    });

    it("returns a JSON content type", async () => {
      const res = await app.fetch(req("GET", "/preferences"));
      expect(res.headers.get("Content-Type")).toContain("application/json");
    });
  });

  describe("PATCH /preferences", () => {
    it("first PATCH returns only the stored field", async () => {
      const res = await app.fetch(req("PATCH", "/preferences", { showImages: false }));
      expect(res.status).toBe(200);

      const json = parsePrefs(await readJson(res));
      expect(json.showImages).toBe(false);
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

    it.skipIf(!emailPrefCtx)("round-trips emailNotifications.tradeStatus", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const emailApp = emailPrefCtx!.app;
      const patched = await emailApp.fetch(
        req("PATCH", "/preferences", { emailNotifications: { tradeStatus: false } }),
      );
      expect(patched.status).toBe(200);
      const patchedJson = parsePrefs(await readJson(patched));
      expect((patchedJson.emailNotifications as { tradeStatus?: boolean }).tradeStatus).toBe(false);

      const fetched = await emailApp.fetch(req("GET", "/preferences"));
      const fetchedJson = parsePrefs(await readJson(fetched));
      expect((fetchedJson.emailNotifications as { tradeStatus?: boolean }).tradeStatus).toBe(false);
    });
  });

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
