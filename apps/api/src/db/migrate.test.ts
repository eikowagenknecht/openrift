import { describe, expect, it, spyOn } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import { Migrator } from "kysely";
import type { Kysely } from "kysely";

import { migrate, rollback } from "./migrate.js";
import type { Database } from "./types.js";

const fakeDb = {} as Kysely<Database>;

// oxlint-disable-next-line no-empty-function -- noop logger for tests
const noop = () => {};
function makeLog(): Logger {
  return { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
}

describe("migrate()", () => {
  it("logs success and completion message", async () => {
    const log = makeLog();
    const infoSpy = spyOn(log, "info");
    const spy = spyOn(Migrator.prototype, "migrateToLatest").mockResolvedValueOnce({
      error: undefined,
      results: [{ migrationName: "001-test", status: "Success", direction: "Up" }],
    });

    await migrate(fakeDb, log);

    expect(infoSpy).toHaveBeenCalledWith("✓ 001-test");
    expect(infoSpy).toHaveBeenCalledWith("Migrations applied successfully");
    spy.mockRestore();
  });

  it("logs error results and throws the error", async () => {
    const log = makeLog();
    const errorSpy = spyOn(log, "error");
    const spy = spyOn(Migrator.prototype, "migrateToLatest").mockResolvedValueOnce({
      error: new Error("migration failed"),
      results: [{ migrationName: "001-fail", status: "Error", direction: "Up" }],
    });

    await expect(migrate(fakeDb, log)).rejects.toThrow("migration failed");
    expect(errorSpy).toHaveBeenCalledWith("✗ 001-fail");
    spy.mockRestore();
  });

  it("wraps non-Error values before throwing", async () => {
    const spy = spyOn(Migrator.prototype, "migrateToLatest").mockResolvedValueOnce({
      error: "string error",
      results: [],
    });

    await expect(migrate(fakeDb, makeLog())).rejects.toThrow("string error");
    spy.mockRestore();
  });

  it("logs 'Already up to date' when no migrations run", async () => {
    const log = makeLog();
    const infoSpy = spyOn(log, "info");
    const spy = spyOn(Migrator.prototype, "migrateToLatest").mockResolvedValueOnce({
      error: undefined,
      results: [],
    });

    await migrate(fakeDb, log);

    expect(infoSpy).toHaveBeenCalledWith("Already up to date");
    spy.mockRestore();
  });
});

describe("rollback()", () => {
  it("logs success and completion message", async () => {
    const log = makeLog();
    const infoSpy = spyOn(log, "info");
    const spy = spyOn(Migrator.prototype, "migrateDown").mockResolvedValueOnce({
      error: undefined,
      results: [{ migrationName: "001-test", status: "Success", direction: "Down" }],
    });

    await rollback(fakeDb, log);

    expect(infoSpy).toHaveBeenCalledWith("↓ 001-test");
    expect(infoSpy).toHaveBeenCalledWith("Rolled back successfully");
    spy.mockRestore();
  });

  it("logs error results and throws the error", async () => {
    const log = makeLog();
    const errorSpy = spyOn(log, "error");
    const spy = spyOn(Migrator.prototype, "migrateDown").mockResolvedValueOnce({
      error: new Error("rollback failed"),
      results: [{ migrationName: "001-fail", status: "Error", direction: "Down" }],
    });

    await expect(rollback(fakeDb, log)).rejects.toThrow("rollback failed");
    expect(errorSpy).toHaveBeenCalledWith("✗ 001-fail");
    spy.mockRestore();
  });

  it("wraps non-Error values before throwing", async () => {
    const spy = spyOn(Migrator.prototype, "migrateDown").mockResolvedValueOnce({
      error: "string error",
      results: [],
    });

    await expect(rollback(fakeDb, makeLog())).rejects.toThrow("string error");
    spy.mockRestore();
  });

  it("logs 'Nothing to roll back' when no results", async () => {
    const log = makeLog();
    const infoSpy = spyOn(log, "info");
    const spy = spyOn(Migrator.prototype, "migrateDown").mockResolvedValueOnce({
      error: undefined,
      results: [],
    });

    await rollback(fakeDb, log);

    expect(infoSpy).toHaveBeenCalledWith("Nothing to roll back");
    spy.mockRestore();
  });
});
