import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import { createMockDb } from "../test/mock-db.js";
import { adminEventsRepo, buildEventsCursor } from "./admin-events.js";

describe("buildEventsCursor (re-exported from collection-events)", () => {
  it("encodes createdAt and id into a single string", () => {
    const cursor = buildEventsCursor(new Date("2026-01-15T12:30:00.000Z"), "abc-123");
    expect(cursor).toBe("2026-01-15T12:30:00.000Z_abc-123");
  });
});

describe("adminEventsRepo", () => {
  it("list returns rows without a cursor", async () => {
    const db = createMockDb([]);
    const repo = adminEventsRepo(db);
    expect(await repo.list({}, 20)).toEqual([]);
  });

  it("list applies cursor filter when provided", async () => {
    const db = createMockDb([]);
    const repo = adminEventsRepo(db);
    expect(await repo.list({}, 20, "2026-01-01T00:00:00.000Z_ae-last")).toEqual([]);
  });

  // Regression: parseCursor used to pass an unparseable cursor straight into
  // `new Date(...)` and let the resulting Invalid Date reach the Kysely
  // query, producing an INTERNAL_ERROR 500. The query schema now rejects
  // malformed cursors before they get this far, but the repo also guards
  // itself so any unvalidated caller fails with a 400 AppError instead.
  it("list rejects an unparseable cursor", async () => {
    const db = createMockDb([]);
    const repo = adminEventsRepo(db);
    await expect(repo.list({}, 20, "not-a-date")).rejects.toBeInstanceOf(AppError);
    await expect(repo.list({}, 20, "not-a-date")).rejects.toMatchObject({ status: 400 });
  });
});
