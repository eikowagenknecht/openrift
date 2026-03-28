import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { healthRepo } from "./health.js";

const ctx = createDbContext("a0000000-0040-4000-a000-000000000001");

describe.skipIf(!ctx)("healthRepo (integration)", () => {
  const { db } = ctx!;
  const repo = healthRepo(db);

  it("healthCheck returns 'ok' when DB is connected, migrated, and has data", async () => {
    const status = await repo.healthCheck(5000);
    expect(status).toBe("ok");
  });

  it("healthCheck returns result within timeout", async () => {
    const start = Date.now();
    const status = await repo.healthCheck(10_000);
    const elapsed = Date.now() - start;
    expect(status).toBe("ok");
    expect(elapsed).toBeLessThan(10_000);
  });
});
