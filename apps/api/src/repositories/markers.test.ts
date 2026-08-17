import { describe, expect, it } from "vitest";

import { createRecordingDb } from "../test/recording-db.js";
import { markersRepo } from "./markers.js";

describe("markersRepo.setForPrinting", () => {
  // Regression: the delete and the insert ran on the bare db (same shape as
  // distributionChannelsRepo.setForPrinting) — a failure between them left the
  // printing with no markers at all.
  it("runs the delete and the insert in one transaction", async () => {
    const { db, queries, events } = createRecordingDb();

    await markersRepo(db).setForPrinting("printing-1", ["marker-a", "marker-b"]);

    expect(events).toEqual(["begin", "commit"]);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('delete from "printing_markers"');
    expect(queries[1]).toContain('insert into "printing_markers"');
  });

  it("rolls back when the insert fails, keeping the old markers", async () => {
    const { db, events } = createRecordingDb([[], new Error("foreign key violation")]);

    await expect(markersRepo(db).setForPrinting("printing-1", ["marker-a"])).rejects.toThrow(
      "foreign key violation",
    );
    expect(events).toEqual(["begin", "rollback"]);
  });

  it("clears the printing's markers when the new set is empty", async () => {
    const { db, queries, events } = createRecordingDb();

    await markersRepo(db).setForPrinting("printing-1", []);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('delete from "printing_markers"');
    expect(events).toEqual(["begin", "commit"]);
  });

  // The transactional callers in printing-admin.ts hand in a trx-bound repo
  // set; opening a second transaction there would nest.
  it("reuses an open transaction instead of nesting", async () => {
    const { db, events } = createRecordingDb();

    await db.transaction().execute(async (trx) => {
      await markersRepo(trx).setForPrinting("printing-1", ["marker-a"]);
    });

    expect(events).toEqual(["begin", "commit"]);
  });
});
