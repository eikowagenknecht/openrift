import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { featureFlagsRepo } from "../../repositories/feature-flags.js";
import { userFeatureFlagsRepo } from "../../repositories/user-feature-flags.js";
import {
  createTestContext,
  createUnauthenticatedTestContext,
  req,
  seedTestUser,
} from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// Guards app.ts wiring the `loadSession` middleware onto every public read whose
// body differs by auth state: it resolves `context.user` and appends
// `Vary: Cookie`, without which a shared/edge cache could serve an anonymous
// body to a signed-in viewer or vice versa. The token-gated landings resolve
// the viewer via `context.loadUser()` instead, so only the `Vary` half matters there.

// Random per-file user (seeded via seedTestUser in beforeAll) so this file
// cannot collide with pre-seeded registry users or other files' fixtures.
const USER_ID = crypto.randomUUID();
const USER_EMAIL = `test-${USER_ID}@test.com`;
const FLAG_KEY = "optional-auth-guard-flag";

const anonCtx = createUnauthenticatedTestContext();
const authCtx = createTestContext(USER_ID, USER_EMAIL);

describe.skipIf(!anonCtx || !authCtx)("Optional-auth public reads (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const anon = anonCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const auth = authCtx!;

  beforeAll(async () => {
    // The override row FKs to users(id); seed a user to hang it off.
    await seedTestUser(auth.db, { id: USER_ID });
    await featureFlagsRepo(auth.db).create({ key: FLAG_KEY, enabled: false, description: null });
    await userFeatureFlagsRepo(auth.db).upsert(USER_ID, FLAG_KEY, true);
  });

  afterAll(async () => {
    // Deleting the user cascades the override away; drop the global flag too.
    await auth.db.deleteFrom("users").where("id", "=", USER_ID).execute();
    await featureFlagsRepo(auth.db).deleteByKey(FLAG_KEY);
  });

  describe("GET /feature-flags", () => {
    it("sets Vary: Cookie and is publicly cacheable for an anonymous read", async () => {
      const res = await anon.app.request(req("GET", "/feature-flags"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Vary")).toContain("Cookie");
      expect(res.headers.get("Cache-Control")).toContain("public");
      const body = (await readJson(res)) as { flags: Record<string, boolean> };
      expect(body.flags[FLAG_KEY]).toBe(false);
    });

    it("sets Vary: Cookie, marks the response private, and honours the viewer's override", async () => {
      const res = await auth.app.request(req("GET", "/feature-flags"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Vary")).toContain("Cookie");
      expect(res.headers.get("Cache-Control")).toContain("private");
      const body = (await readJson(res)) as { flags: Record<string, boolean> };
      expect(body.flags[FLAG_KEY]).toBe(true);
    });
  });

  describe("GET /users/share/{token}", () => {
    it("runs loadSession (Vary: Cookie) even when the token is unknown", async () => {
      const res = await anon.app.request(req("GET", "/users/share/nonexistent-token"));
      expect(res.status).toBe(404);
      expect(res.headers.get("Vary")).toContain("Cookie");
    });
  });

  // Checked against an unknown token: the wiring is on the path, so it
  // applies before the handler decides the token matches nothing.
  describe("token-gated landings", () => {
    it("runs loadSession on the group join preview", async () => {
      const res = await anon.app.request(req("GET", "/friend-groups/preview?code=NOSUCHCODE12"));
      expect(res.status).toBe(404);
      expect(res.headers.get("Vary")).toContain("Cookie");
    });

    it("runs loadSession on the tournament submit landing", async () => {
      const res = await anon.app.request(req("GET", "/tournaments/submit/nonexistent-token"));
      expect(res.status).toBe(404);
      expect(res.headers.get("Vary")).toContain("Cookie");
    });

    it("runs loadSession on the staff-invite landing", async () => {
      const res = await anon.app.request(req("GET", "/tournaments/staff-invite/nonexistent-token"));
      expect(res.status).toBe(404);
      expect(res.headers.get("Vary")).toContain("Cookie");
    });
  });
});
