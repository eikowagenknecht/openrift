import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { mountCardSubmissionsMiddleware } from "./card-submissions";

// The body limit is path middleware registered ahead of the oRPC catch-all
// (app.ts), so it is mounted here on a bare app — no router, since an
// over-cap request never reaches one.
const app = new Hono<{ Variables: Variables }>();
mountCardSubmissionsMiddleware(app);
app.post("/api/v1/card-submissions", (c) => c.json({ ok: true }));

/** @returns The response to a submission POST carrying a note of `noteLength` characters. */
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
    // The client must get the same envelope here as for this endpoint's 401 /
    // 400 / 429: `defined` and `status` are what let it rebuild the error
    // instead of discarding the body as a malformed response.
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
