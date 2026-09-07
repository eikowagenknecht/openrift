import { describe, expect, it } from "vitest";

import { createUnauthenticatedTestContext } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const ctx = createUnauthenticatedTestContext();

describe.skipIf(!ctx)("Health route (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  function healthReq(): Request {
    return new Request("http://localhost/api/health", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns 200 with status ok when database is healthy", async () => {
    const res = await app.fetch(healthReq());
    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json.status).toBe("ok");
  });

  it("sets Cache-Control to no-store", async () => {
    const res = await app.fetch(healthReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns a JSON content type", async () => {
    const res = await app.fetch(healthReq());
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
