import { ERROR_CODES } from "@openrift/shared/error-codes";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { mountScanReportsMiddleware } from "./scan-reports";

// Mounted on a bare app with no router: an over-cap request never reaches one.
const app = new Hono<{ Variables: Variables }>();
mountScanReportsMiddleware(app);
app.post("/api/v1/scan-reports", (c) => c.json({ reference: "SC-ABCD" }));

function send(noteLength: number) {
  return app.request("/api/v1/scan-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ journal: [], note: "x".repeat(noteLength) }),
  });
}

describe("scan-reports body limit", () => {
  it("rejects a report over 256 KB with a 413 the oRPC client can parse", async () => {
    const res = await send(256 * 1024);

    expect(res.status).toBe(413);
    expect(await readJson(res)).toStrictEqual({
      defined: false,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      status: 413,
      message: "Report exceeds 256 KB",
    });
  });

  it("lets an under-cap report through", async () => {
    const res = await send(100);

    expect(res.status).toBe(200);
  });
});
