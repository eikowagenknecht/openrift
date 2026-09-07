import { describe, expect, it } from "vitest";

import { parseTestDbTimestamp, replaceDbName } from "./integration-setup.js";

describe("parseTestDbTimestamp", () => {
  it("extracts the epoch-ms from openrift_test_<label>_<epoch-ms>_<pid>_<seq>", () => {
    expect(parseTestDbTimestamp("openrift_test_shared_1782885425522_12345_0")).toBe(
      1_782_885_425_522,
    );
    expect(parseTestDbTimestamp("openrift_test_migrations_1782885587876_9_3")).toBe(
      1_782_885_587_876,
    );
  });

  it("tolerates the legacy suffix-less format", () => {
    expect(parseTestDbTimestamp("openrift_test_shared_1782885425522")).toBe(1_782_885_425_522);
  });

  it("returns null for names that are not temp test DBs", () => {
    expect(parseTestDbTimestamp("openrift")).toBeNull();
    expect(parseTestDbTimestamp("postgres")).toBeNull();
    expect(parseTestDbTimestamp("openrift_test_shared_notanumber")).toBeNull();
    expect(parseTestDbTimestamp("some_openrift_test_shared_123")).toBeNull();
  });

  it("drives the stale-vs-fresh age decision the sweep relies on", () => {
    const now = 1_000_000_000_000;
    const maxAgeMs = 30 * 60 * 1000;
    const isStale = (name: string): boolean => {
      const timestamp = parseTestDbTimestamp(name);
      return timestamp !== null && now - timestamp > maxAgeMs;
    };
    expect(isStale(`openrift_test_shared_${now - 31 * 60 * 1000}_1_0`)).toBe(true);
    expect(isStale(`openrift_test_shared_${now - 29 * 60 * 1000}_1_0`)).toBe(false);
    expect(isStale("openrift")).toBe(false);
  });
});

describe("replaceDbName", () => {
  it("swaps the database segment while keeping host and query string", () => {
    expect(replaceDbName("postgres://u:p@localhost:5432/openrift", "openrift_test_x")).toBe(
      "postgres://u:p@localhost:5432/openrift_test_x",
    );
    expect(replaceDbName("postgres://u:p@localhost:5432/openrift?sslmode=require", "temp")).toBe(
      "postgres://u:p@localhost:5432/temp?sslmode=require",
    );
  });
});
