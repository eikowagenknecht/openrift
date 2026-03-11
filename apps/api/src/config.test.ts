import { describe, expect, it } from "bun:test";

// Import the REAL config — no mock.module. If config.ts throws at module
// load time (e.g. a requireEnv call), this import alone will fail the test,
// catching the regression before it breaks every other test file's mocks.
import { config } from "./config.js";

describe("config", () => {
  it("evaluates without throwing when env vars are missing", () => {
    expect(config).toBeDefined();
    expect(typeof config.port).toBe("number");
    expect(typeof config.databaseUrl).toBe("string");
    expect(typeof config.auth.secret).toBe("string");
  });
});
