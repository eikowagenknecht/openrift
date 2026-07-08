import { afterAll, describe, expect, it } from "vitest";

import { createAuth } from "./auth.js";
import { createDb } from "./db/connect.js";
import { createEmailSender } from "./email.js";

// ---------------------------------------------------------------------------
// Integration tests: API key authentication
//
// The @better-auth/api-key plugin (auth.ts) lets scripts call the API with an
// `x-api-key` header instead of a session cookie. With
// `enableSessionForAPIKeys`, a valid key makes `auth.api.getSession` resolve a
// session for the key's owner, which is what requireAuth/requireAdmin consume.
// These tests exercise the real better-auth instance against the shared
// integration DB (the app-level harness mocks auth entirely, so it can't
// cover this).
// ---------------------------------------------------------------------------

// Registered in integration-setup TEST_USERS.
const USER_ID = "a0000000-0200-4000-a000-000000000001";
const USER_EMAIL = "key-0200@test.com";

const url = process.env.INTEGRATION_DB_URL;
const conn = url ? createDb(url) : null;

describe.skipIf(!conn)("API key auth (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db, dialect } = conn!;
  const config = {
    isDev: true,
    corsOrigin: undefined,
    auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
    smtp: { configured: false },
  } as never as Parameters<typeof createAuth>[0]["config"];
  const auth = createAuth({
    config,
    db,
    dialect,
    sendEmail: createEmailSender(config.smtp, true),
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("mints a prefixed key and resolves a session for its owner", async () => {
    const created = await auth.api.createApiKey({
      body: { name: "integration", userId: USER_ID },
    });
    expect(created.key).toMatch(/^orift_/u);

    const session = await auth.api.getSession({
      headers: new Headers({ "x-api-key": created.key }),
    });
    expect(session?.user.id).toBe(USER_ID);
    expect(session?.user.email).toBe(USER_EMAIL);
  });

  it("rejects a tampered key", async () => {
    const created = await auth.api.createApiKey({
      body: { name: "tampered", userId: USER_ID },
    });
    const flipped = created.key.endsWith("a") ? "b" : "a";
    const tampered = created.key.slice(0, -1) + flipped;

    await expect(
      auth.api.getSession({ headers: new Headers({ "x-api-key": tampered }) }),
    ).rejects.toThrow();
  });

  it("resolves no session when the header is absent", async () => {
    const session = await auth.api.getSession({ headers: new Headers() });
    expect(session).toBeNull();
  });
});
