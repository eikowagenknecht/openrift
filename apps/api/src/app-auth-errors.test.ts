import { createLogger } from "@openrift/shared/logger";
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import { readJson } from "./test/read-json.js";

const captureException = vi.fn();
vi.mock("@sentry/bun", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

const RATE_LIMITED = new APIError("TOO_MANY_REQUESTS", {
  message: "Rate limit exceeded. Maximum requests allowed.",
  code: "RATE_LIMITED",
  details: { tryAgainIn: 90_000 },
});

const INVALID_KEY = new APIError("UNAUTHORIZED", {
  message: "Invalid API key.",
  code: "INVALID_API_KEY",
});

const baseMockConfig = {
  port: 3000,
  databaseUrl: "postgres://mock",
  isDev: false,
  corsOrigin: undefined,
  auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
};

function buildApp(toThrow: unknown) {
  const auth = {
    handler: () => new Response("ok"),
    api: {
      getSession: () => {
        throw toThrow;
      },
    },
    $Infer: { Session: { user: null, session: null } },
  };
  // oxlint-disable -- test mocks don't match full types
  return createApp({
    db: {} as any,
    auth: auth as any,
    config: baseMockConfig as any,
    log: createLogger("test", "silent"),
  });
  // oxlint-enable
}

async function fetchWithKey(app: ReturnType<typeof buildApp>, path: string): Promise<Response> {
  return await app.fetch(
    new Request(`http://localhost${path}`, { headers: { "x-api-key": "orift_test" } }),
  );
}

describe.each([
  { surface: "Hono onError", path: "/api/v1/feature-flags" },
  { surface: "oRPC pipeline", path: "/api/v1/preferences" },
])("better-auth APIError on the $surface", ({ path }) => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it("answers 429 with Retry-After when the key is rate-limited", async () => {
    const res = await fetchWithKey(buildApp(RATE_LIMITED), path);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("90");
    const json = (await readJson(res)) as Record<string, unknown>;
    expect(json.code).toBe("RATE_LIMITED");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("answers 401 when the key is invalid", async () => {
    const res = await fetchWithKey(buildApp(INVALID_KEY), path);

    expect(res.status).toBe(401);
    expect(res.headers.get("Retry-After")).toBeNull();
    const json = (await readJson(res)) as Record<string, unknown>;
    expect(json.code).toBe("UNAUTHORIZED");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still reports a 5xx from the session lookup", async () => {
    const res = await fetchWithKey(
      buildApp(new APIError("INTERNAL_SERVER_ERROR", { message: "auth store down" })),
      path,
    );

    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
