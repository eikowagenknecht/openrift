import { describe, expect, it } from "vitest";

import { AppError } from "../../../errors.js";
import { createMockDb } from "../../../test/mock-db.js";
import { createRecordingDb } from "../../../test/recording-db.js";
import { adminEventsRepo } from "./admin-events.js";

describe("adminEventsRepo", () => {
  it("list returns rows without a cursor", async () => {
    const db = createMockDb([]);
    const repo = adminEventsRepo(db);
    expect(await repo.list({}, 20)).toEqual([]);
  });

  it("list compares the action filter as a bound text parameter, not the AdminEventAction union", async () => {
    const { db, queries, parameters } = createRecordingDb();

    await adminEventsRepo(db).list({ action: "card.retired-long-ago" }, 20);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('cast("ae"."action" as text) =');
    expect(parameters[0]).toContain("card.retired-long-ago");
  });

  it("list omits the action filter when absent", async () => {
    const { db, queries } = createRecordingDb();

    await adminEventsRepo(db).list({}, 20);

    expect(queries[0]).not.toContain('"ae"."action" =');
  });

  it("list applies cursor filter when provided", async () => {
    const db = createMockDb([]);
    const repo = adminEventsRepo(db);
    expect(await repo.list({}, 20, "2026-01-01T00:00:00.000Z_ae-last")).toEqual([]);
  });

  it("list rejects an unparseable cursor with a 400 AppError instead of reaching the query as an Invalid Date", async () => {
    const db = createMockDb([]);
    const repo = adminEventsRepo(db);
    await expect(repo.list({}, 20, "not-a-date")).rejects.toBeInstanceOf(AppError);
    await expect(repo.list({}, 20, "not-a-date")).rejects.toMatchObject({ status: 400 });
  });
});
