import type { Logger } from "@openrift/shared/logger";
import { describe, expect, it, vi } from "vitest";

// Capture the provider passed to the Migrator constructor
let capturedProvider: { getMigrations: () => Promise<Record<string, unknown>> } | undefined;

vi.mock("kysely", async (importOriginal) => {
  // oxlint-disable-next-line typescript/consistent-type-imports -- vitest dynamic import pattern
  const original = await importOriginal<typeof import("kysely")>();
  return {
    ...original,
    Migrator: class MockMigrator {
      constructor(opts: any) {
        capturedProvider = opts.provider;
      }

      async migrateToLatest() {
        return { error: undefined, results: [] };
      }

      async migrateDown() {
        return { error: undefined, results: [] };
      }
    },
  };
});

// Must import after the mock
const { migrate } = await import("./migrate.js");

// oxlint-disable-next-line no-empty-function -- noop logger for tests
const noop = () => {};
function makeLog(): Logger {
  return { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
}

describe("createMigrator provider", () => {
  it("getMigrations resolves to the migrations record", async () => {
    await migrate({} as any, makeLog());

    expect(capturedProvider).toBeDefined();
    const migrations = await capturedProvider!.getMigrations();
    expect(migrations).toBeDefined();
    expect(typeof migrations).toBe("object");
    expect(Object.keys(migrations).length).toBeGreaterThan(0);
  });
});
