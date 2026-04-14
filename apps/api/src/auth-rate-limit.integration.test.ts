import { describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext } from "./test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: auth rate limiter
//
// Sensitive /api/auth/* endpoints are rate-limited to 10 requests per minute
// per IP (see apps/api/src/app.ts). The e2e harness disables the limiter via
// DISABLE_AUTH_RATE_LIMIT=1 so auth.setup doesn't trip it during UI iteration;
// this test is the one place we verify the limiter still kicks in when the
// env flag isn't set.
// ---------------------------------------------------------------------------

const ctx = createUnauthenticatedTestContext();

function signInReq(ip: string): Request {
  return new Request("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "x-real-ip": ip,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: "nobody@test.com", password: "wrong" }),
  });
}

describe.skipIf(!ctx || process.env.DISABLE_AUTH_RATE_LIMIT === "1")(
  "Auth rate limiter (integration)",
  () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
    const { app } = ctx!;

    it("returns 429 on the 11th request within the window", async () => {
      // Unique IP per test so prior runs/parallel tests don't pollute the
      // in-memory counter.
      const ip = `203.0.113.${Math.floor(Math.random() * 255)}`;

      for (let attempt = 1; attempt <= 10; attempt++) {
        const res = await app.fetch(signInReq(ip));
        expect(res.status, `request ${attempt} should not be rate-limited`).not.toBe(429);
      }

      const overLimit = await app.fetch(signInReq(ip));
      expect(overLimit.status).toBe(429);
    });

    it("does not rate-limit unrelated auth endpoints (e.g. get-session)", async () => {
      const ip = `198.51.100.${Math.floor(Math.random() * 255)}`;
      // Burn the sign-in budget for this IP…
      for (let attempt = 1; attempt <= 11; attempt++) {
        await app.fetch(signInReq(ip));
      }
      // …but get-session isn't in the rate-limited prefix list.
      const getSession = await app.fetch(
        new Request("http://localhost/api/auth/get-session", {
          method: "GET",
          headers: { "x-real-ip": ip },
        }),
      );
      expect(getSession.status).not.toBe(429);
    });
  },
);
