import { describe, expect, it } from "bun:test";

import { createLogger } from "./logger";

describe("createLogger", () => {
  it("creates a logger with standard methods", () => {
    const log = createLogger("test");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
  });

  it("defaults to info level", () => {
    const log = createLogger("test");
    expect(log.level).toBe("info");
  });

  it("accepts a custom level", () => {
    const log = createLogger("test", "debug");
    expect(log.level).toBe("debug");
  });
});
