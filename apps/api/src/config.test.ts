import { describe, expect, it } from "bun:test";

import { createConfig } from "./config.js";

describe("createConfig", () => {
  it("returns defaults when env vars are missing", () => {
    const config = createConfig({});
    expect(typeof config.port).toBe("number");
    expect(typeof config.databaseUrl).toBe("string");
    expect(typeof config.auth.secret).toBe("string");
  });
});
