/* oxlint-disable promise/avoid-new -- need a never-resolving promise to test timeout */
import { describe, expect, it, vi } from "vitest";

import { healthRepo } from "./health.js";

describe("healthRepo", () => {
  it("returns 'db_unreachable' when DB connection throws", async () => {
    const mockDb = {
      executeQuery: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as any;
    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(5000);
    expect(status).toBe("db_unreachable");
  });

  it("returns 'db_unreachable' on timeout", async () => {
    // Create a mock that hangs forever — triggers the HealthTimeoutError path
    const mockDb = {
      executeQuery: vi.fn().mockReturnValue(new Promise(() => {})),
    } as any;
    const repo = healthRepo(mockDb);
    const status = await repo.healthCheck(1);
    expect(status).toBe("db_unreachable");
  });
});
