import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRepos } from "../../deps.js";
import { signUnsubscribeToken } from "../../emails/unsubscribe-token.js";
import { createUnauthenticatedTestContext } from "../../test/integration-context.js";

// Mirrors the secret in integration-context's mockConfig.auth.secret.
const SECRET = "test";
const USER_ID = "a0000000-0063-4000-a000-000000000001";

const ctx = createUnauthenticatedTestContext();

describe.skipIf(!ctx)("GET /unsubscribe (integration)", () => {
  const { app, db } = ctx!;
  const repos = createRepos(db);

  beforeAll(async () => {
    await db
      .insertInto("users")
      .values({
        id: USER_ID,
        email: "unsub-0063@test.com",
        name: "Test User",
        emailVerified: true,
        image: null,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  });

  beforeEach(async () => {
    // Both channels on, so a flip is observable and the sibling is checkable.
    await repos.userPreferences.upsert(USER_ID, {
      emailNotifications: { tradeMatches: true, tradeRequests: true },
    });
  });

  afterAll(async () => {
    await db.deleteFrom("userPreferences").where("userId", "=", USER_ID).execute();
    await db.deleteFrom("users").where("id", "=", USER_ID).execute();
  });

  async function readChannels() {
    const row = await repos.userPreferences.getByUserId(USER_ID);
    return row?.data.emailNotifications ?? {};
  }

  it("flips exactly the named channel and preserves the sibling", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeMatches");
    const response = await app.request(`/api/v1/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(response.status).toBe(200);
    expect(await readChannels()).toEqual({ tradeMatches: false, tradeRequests: true });
  });

  it("flips the request channel without touching the digest channel", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
    const response = await app.request(`/api/v1/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(response.status).toBe(200);
    expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: false });
  });

  it("rejects a tampered token and changes nothing", async () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeMatches");
    const tampered = `${token}tampered`;
    const response = await app.request(`/api/v1/unsubscribe?token=${encodeURIComponent(tampered)}`);
    expect(response.status).toBe(400);
    expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: true });
  });

  it("rejects a missing token", async () => {
    const response = await app.request("/api/v1/unsubscribe");
    expect(response.status).toBe(400);
    expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: true });
  });
});
