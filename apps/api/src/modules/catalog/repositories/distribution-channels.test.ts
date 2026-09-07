import { describe, expect, it } from "vitest";

import { createRecordingDb } from "../../../test/recording-db.js";
import { distributionChannelsRepo } from "./distribution-channels.js";

describe("distributionChannelsRepo.setForPrinting", () => {
  it("runs the delete and the insert in one transaction", async () => {
    const { db, queries, events } = createRecordingDb();

    await distributionChannelsRepo(db).setForPrinting("printing-1", [{ channelId: "channel-a" }]);

    expect(events).toEqual(["begin", "commit"]);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('delete from "printing_distribution_channels"');
    expect(queries[1]).toContain('insert into "printing_distribution_channels"');
  });

  it("rolls back when the insert fails, keeping the old channels", async () => {
    const { db, events } = createRecordingDb([[], new Error("foreign key violation")]);

    await expect(
      distributionChannelsRepo(db).setForPrinting("printing-1", [{ channelId: "channel-a" }]),
    ).rejects.toThrow("foreign key violation");
    expect(events).toEqual(["begin", "rollback"]);
  });

  it("clears the printing's channels when the new set is empty", async () => {
    const { db, queries, events } = createRecordingDb();

    await distributionChannelsRepo(db).setForPrinting("printing-1", []);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('delete from "printing_distribution_channels"');
    expect(events).toEqual(["begin", "commit"]);
  });

  it("reuses an open transaction instead of nesting", async () => {
    const { db, events } = createRecordingDb();

    await db.transaction().execute(async (trx) => {
      await distributionChannelsRepo(trx).setForPrinting("printing-1", [
        { channelId: "channel-a", distributionNote: "Prerelease" },
      ]);
    });

    expect(events).toEqual(["begin", "commit"]);
  });
});
