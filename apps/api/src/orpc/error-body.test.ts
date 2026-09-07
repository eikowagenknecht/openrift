import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { readJson } from "../test/read-json.js";
import { orpcErrorResponse } from "./error-body.js";

const app = new Hono().get("/too-large", (c) =>
  orpcErrorResponse(c, ERROR_CODES.PAYLOAD_TOO_LARGE, "Push exceeds 1 MB"),
);

async function body(): Promise<Record<string, unknown>> {
  const res = await app.request("/too-large");
  return await readJson<Record<string, unknown>>(res);
}

describe("orpcErrorResponse", () => {
  it("answers with the status oRPC assigns to the code", async () => {
    const res = await app.request("/too-large");

    expect(res.status).toBe(413);
  });

  it("emits every field isORPCErrorJson requires, so a client can rebuild the error", async () => {
    const parsed = await body();

    expect(typeof parsed.defined).toBe("boolean");
    expect(typeof parsed.code).toBe("string");
    expect(typeof parsed.status).toBe("number");
    expect(typeof parsed.message).toBe("string");
  });

  it("carries the code, message and status through to the body", async () => {
    const parsed = await body();

    expect(parsed).toMatchObject({
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      status: 413,
      message: "Push exceeds 1 MB",
    });
  });

  it("marks the error undefined, since no contract declares a pre-pipeline rejection", async () => {
    const parsed = await body();

    expect(parsed.defined).toBe(false);
  });

  it("carries no key beyond the ones isORPCErrorJson allows", async () => {
    const parsed = await body();

    expect(Object.keys(parsed).toSorted()).toStrictEqual(["code", "defined", "message", "status"]);
  });
});
