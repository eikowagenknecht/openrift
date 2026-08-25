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

// Optional-auth coupling guard.
//
// Exactly two public reads branch on the viewer (`context.user`) instead of
// being fully anonymous: `GET /api/v1/feature-flags` and
// `GET /api/v1/users/share/{token}`. Both rely on app.ts wiring the
// `loadSession` middleware onto their path — that middleware resolves the
// session into `context.user` AND appends `Vary: Cookie` so a shared/edge cache
// keys on the cookie (and never serves an anonymous body to a signed-in viewer,
// or vice-versa). A *future* viewer-reading public route added without its
// `app.use(path, loadSession)` line would silently treat a signed-in user as
// anonymous. These tests fail closed if that wiring is dropped for either route:
//   - the `Vary: Cookie` header disappears, and
//   - feature-flags stops honouring the signed-in viewer's per-user override.
//
// The ETag/304 + Cache-Control half of the same wiring is covered in
// catalog.integration.test.ts.

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
    // Global default OFF, per-user override ON: the signed-in viewer only sees
    // the flag enabled if `loadSession` resolved them onto `context.user`.
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
      // The per-user override wins over the global default only because
      // loadSession resolved the viewer onto context.user.
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
});
