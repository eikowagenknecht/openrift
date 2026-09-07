import { describe, expect, it } from "vitest";

import { createRecordingDb } from "../test/recording-db.js";
import { customTagsRepo } from "./custom-tags.js";

describe("customTagsRepo.setForCard", () => {
  it("runs the clear and the insert in one transaction", async () => {
    const { db, queries, events } = createRecordingDb();

    await customTagsRepo(db).setForCard("card-1", ["tag-a", "tag-b"]);

    expect(events).toEqual(["begin", "commit"]);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('delete from "card_custom_tags"');
    expect(queries[1]).toContain('insert into "card_custom_tags"');
  });

  it("rolls back when the insert fails, leaving the old tags in place", async () => {
    const { db, events } = createRecordingDb([[], new Error("unique violation")]);

    await expect(customTagsRepo(db).setForCard("card-1", ["tag-a"])).rejects.toThrow(
      "unique violation",
    );
    expect(events).toEqual(["begin", "rollback"]);
  });

  it("clears the card's tags when the new set is empty", async () => {
    const { db, queries, events } = createRecordingDb();

    await customTagsRepo(db).setForCard("card-1", []);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('delete from "card_custom_tags"');
    expect(events).toEqual(["begin", "commit"]);
  });

  it("reuses an open transaction instead of nesting, avoiding a savepoint-less second BEGIN", async () => {
    const { db, events } = createRecordingDb();

    await db.transaction().execute(async (trx) => {
      await customTagsRepo(trx).setForCard("card-1", ["tag-a"]);
    });

    expect(events).toEqual(["begin", "commit"]);
  });
});
