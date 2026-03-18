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

const baseMockConfig = {
  port: 3000,
  databaseUrl: "postgres://mock",
  corsOrigin: undefined,
  auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
};

function buildApp(isDev: boolean) {
  // oxlint-disable -- test mocks don't match full types
  const a = createApp({
    db: {} as any,
    auth: mockAuth as any,
    config: { ...baseMockConfig, isDev } as any,
    log: createLogger("test", "silent"),
  });

  a.get("/api/test-error/app-error", () => {
    throw new AppError(409, "CONFLICT", "Already exists", { field: "name" });
  });

  a.get("/api/test-error/app-error-no-details", () => {
    throw new AppError(404, "NOT_FOUND", "Not found");
  });

  a.get("/api/test-error/zod-error", () => {
    const schema = z.object({ name: z.string() });
    schema.parse({ name: 123 });
  });

  a.get("/api/test-error/http-exception", () => {
    throw new HTTPException(403, { message: "Forbidden" });
  });

  a.get("/api/test-error/generic-error", () => {
    throw new Error("Something unexpected");
  });

  a.post("/api/test-error/json-body", async (c) => {
    await c.req.json();
    return c.json({ ok: true });
  });
  // oxlint-enable

  return a;
}

const app = buildApp(true);
const prodApp = buildApp(false);

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

  it("handles AppError with details in dev", async () => {
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

  it("handles ZodError with details in dev", async () => {
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
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("HTTP_ERROR");
    expect(json.error).toBe("Forbidden");
  });

  it("includes stack trace in dev for generic errors", async () => {
    const res = await app.fetch(new Request("http://localhost/api/test-error/generic-error"));
    expect(res.status).toBe(500);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("INTERNAL_ERROR");
    expect(json.error).toBe("Internal server error");
    const details = json.details as { message: string; stack: string };
    expect(details.message).toBe("Something unexpected");
    expect(details.stack).toContain("Something unexpected");
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

describe("onError handler (production)", () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("strips AppError details in production", async () => {
    const res = await prodApp.fetch(new Request("http://localhost/api/test-error/app-error"));
    expect(res.status).toBe(409);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe("Already exists");
    expect(json.code).toBe("CONFLICT");
    expect(json).not.toHaveProperty("details");
  });

  it("strips ZodError details in production", async () => {
    const res = await prodApp.fetch(new Request("http://localhost/api/test-error/zod-error"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Invalid request body");
    expect(json).not.toHaveProperty("details");
  });

  it("strips stack trace in production for generic errors", async () => {
    const res = await prodApp.fetch(new Request("http://localhost/api/test-error/generic-error"));
    expect(res.status).toBe(500);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("INTERNAL_ERROR");
    expect(json.error).toBe("Internal server error");
    expect(json).not.toHaveProperty("details");
  });
});
