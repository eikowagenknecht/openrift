import { ERROR_CODES } from "@openrift/shared/error-codes";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { mountCardSubmissionsMiddleware } from "./card-submissions";

// Mounted on a bare app with no router: an over-cap request never reaches one.
const app = new Hono<{ Variables: Variables }>();
mountCardSubmissionsMiddleware(app);
app.post("/api/v1/card-submissions", (c) => c.json({ ok: true }));

function submit(noteLength: number) {
  return app.request("/api/v1/card-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "vi", submissionNote: "x".repeat(noteLength) }),
  });
}

describe("card-submissions body limit", () => {
  it("rejects a submission over 256 KB with a 413 the oRPC client can parse", async () => {
    const res = await submit(256 * 1024);

    expect(res.status).toBe(413);
    // `defined` and `status` must match the shape of this endpoint's other errors
    // or the client discards the body as a malformed response.
    expect(await readJson(res)).toStrictEqual({
      defined: false,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      status: 413,
      message: "Submission exceeds 256 KB",
    });
  });

  it("lets an under-cap submission through", async () => {
    const res = await submit(100);

    expect(res.status).toBe(200);
  });
});
