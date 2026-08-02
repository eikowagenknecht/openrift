import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRepos } from "../../deps.js";
import { signUnsubscribeToken } from "../../emails/unsubscribe-token.js";
import { createUnauthenticatedTestContext, seedTestUser } from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// Mirrors the secret in integration-context's mockConfig.auth.secret.
const SECRET = "test";
const USER_ID = crypto.randomUUID();

const ctx = createUnauthenticatedTestContext();

describe.skipIf(!ctx)("unsubscribe (integration)", () => {
  const { app, db } = ctx!;
  const repos = createRepos(db);

  beforeAll(async () => {
    await seedTestUser(db, { id: USER_ID });
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

  function oneClick(token: string) {
    // Mimics the mail-client one-click POST: form body, token in the query.
    return app.request(`/api/v1/unsubscribe/one-click?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
  }

  describe("POST /unsubscribe/one-click (RFC 8058)", () => {
    it("flips exactly the named channel and preserves the sibling", async () => {
      const token = signUnsubscribeToken(SECRET, USER_ID, "tradeMatches");
      const response = await oneClick(token);
      expect(response.status).toBe(204);
      expect(await readChannels()).toEqual({ tradeMatches: false, tradeRequests: true });
    });

    it("flips the request channel without touching the digest channel", async () => {
      const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
      const response = await oneClick(token);
      expect(response.status).toBe(204);
      expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: false });
    });

    it("rejects a tampered token and changes nothing", async () => {
      const token = signUnsubscribeToken(SECRET, USER_ID, "tradeMatches");
      const response = await oneClick(`${token}tampered`);
      expect(response.status).toBe(400);
      expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: true });
    });

    it("rejects a missing token", async () => {
      const response = await app.request("/api/v1/unsubscribe/one-click", { method: "POST" });
      expect(response.status).toBe(400);
      expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: true });
    });
  });

  describe("GET /unsubscribe/preview (read-only)", () => {
    it("reports the channel + state and mutates nothing", async () => {
      const token = signUnsubscribeToken(SECRET, USER_ID, "tradeMatches");
      const response = await app.request(
        `/api/v1/unsubscribe/preview?token=${encodeURIComponent(token)}`,
      );
      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({
        valid: true,
        channel: "tradeMatches",
        alreadyUnsubscribed: false,
      });
      // The critical guarantee: a GET never changes state.
      expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: true });
    });

    it("returns valid=false for a tampered token", async () => {
      const token = signUnsubscribeToken(SECRET, USER_ID, "tradeMatches");
      const response = await app.request(
        `/api/v1/unsubscribe/preview?token=${encodeURIComponent(`${token}x`)}`,
      );
      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({ valid: false });
    });
  });

  describe("POST /unsubscribe (confirm)", () => {
    function confirm(token: string) {
      return app.request("/api/v1/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
    }

    it("flips the channel and returns its label", async () => {
      const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
      const response = await confirm(token);
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual({
        channel: "tradeRequests",
        channelLabel: "trade-request emails",
      });
      expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: false });
    });

    it("rejects a tampered token with 400 and changes nothing", async () => {
      const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
      const response = await confirm(`${token}x`);
      expect(response.status).toBe(400);
      expect(await readChannels()).toEqual({ tradeMatches: true, tradeRequests: true });
    });
  });
});
