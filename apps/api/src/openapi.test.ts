import { createRoute, z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";

import { createApiApp } from "./openapi.js";

describe("createApiApp defaultHook", () => {
  const echoRoute = createRoute({
    method: "post",
    path: "/echo",
    request: {
      body: { content: { "application/json": { schema: z.object({ name: z.string() }) } } },
    },
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ name: z.string() }) } },
        description: "ok",
      },
    },
  });

  const app = createApiApp().openapi(echoRoute, (c) => c.json(c.req.valid("json")));

  it("returns the standard { error, code } envelope on validation failure", async () => {
    const res = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: 123 }),
    });
    // Without the defaultHook this would be zod-validator's { success, error, data }
    // shape with no `code`. With it, validation flows into the standard envelope.
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Invalid request body");
    expect(Array.isArray(json.details)).toBe(true);
  });

  it("passes validated input through to the handler", async () => {
    const res = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ok" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "ok" });
  });
});
