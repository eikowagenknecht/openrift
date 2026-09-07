import { describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext } from "./test/integration-context.js";

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
      for (let attempt = 1; attempt <= 11; attempt++) {
        await app.fetch(signInReq(ip));
      }
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
