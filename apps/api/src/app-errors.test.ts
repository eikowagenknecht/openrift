import { createLogger } from "@openrift/shared/logger";
import { HTTPException } from "hono/http-exception";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

import { createApp } from "./app.js";
import { AppError } from "./errors.js";

// ---------------------------------------------------------------------------
// Mock deps — minimal stubs to boot the app
// ---------------------------------------------------------------------------

const mockAuth = {
  handler: () => new Response("ok"),
  api: { getSession: () => null },
  $Infer: { Session: { user: null, session: null } },
};

const mockConfig = {
  port: 3000,
  databaseUrl: "postgres://mock",
  corsOrigin: undefined,
  auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
};

// oxlint-disable -- test mocks don't match full types
const app = createApp({
  db: {} as any,
  auth: mockAuth as any,
  config: mockConfig as any,
  log: createLogger("test", "silent"),
});

// Register test-only routes that throw specific error types
app.get("/api/test-error/app-error", () => {
  throw new AppError(409, "CONFLICT", "Already exists", { field: "name" });
});

app.get("/api/test-error/app-error-no-details", () => {
  throw new AppError(404, "NOT_FOUND", "Not found");
});

app.get("/api/test-error/zod-error", () => {
  const schema = z.object({ name: z.string() });
  schema.parse({ name: 123 });
});

app.get("/api/test-error/http-exception", () => {
  throw new HTTPException(403, { message: "Forbidden" });
});

app.get("/api/test-error/generic-error", () => {
  throw new Error("Something unexpected");
});

app.post("/api/test-error/json-body", async (c) => {
  await c.req.json();
  return c.json({ ok: true });
});
// oxlint-enable

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("onError handler", () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("handles AppError with details", async () => {
    const res = await app.fetch(new Request("http://localhost/api/test-error/app-error"));
    expect(res.status).toBe(409);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe("Already exists");
    expect(json.code).toBe("CONFLICT");
    expect(json.details).toEqual({ field: "name" });
  });

  it("handles AppError without details", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/test-error/app-error-no-details"),
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe("Not found");
    expect(json.code).toBe("NOT_FOUND");
    expect(json).not.toHaveProperty("details");
  });

  it("handles ZodError", async () => {
    const res = await app.fetch(new Request("http://localhost/api/test-error/zod-error"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Invalid request body");
    expect(Array.isArray(json.details)).toBe(true);
  });

  it("handles HTTPException", async () => {
    const res = await app.fetch(new Request("http://localhost/api/test-error/http-exception"));
    expect(res.status).toBe(403);
  });

  it("handles generic Error as 500", async () => {
    const res = await app.fetch(new Request("http://localhost/api/test-error/generic-error"));
    expect(res.status).toBe(500);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("INTERNAL_ERROR");
    expect(json.error).toBe("Internal server error");
  });

  it("handles SyntaxError from malformed JSON", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/test-error/json-body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{{{",
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("BAD_REQUEST");
    expect(json.error).toBe("Invalid JSON in request body");
  });
});
