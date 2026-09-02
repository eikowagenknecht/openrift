import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { jobSchedulesRepo } from "./job-schedules.js";

const ROW = {
  kind: "tcgplayer.refresh",
  schedule: "0 6 * * *",
  updatedAt: new Date("2026-09-01T00:00:00Z"),
};

describe("jobSchedulesRepo", () => {
  it("listAll returns every stored schedule", async () => {
    const repo = jobSchedulesRepo(createMockDb([ROW]));
    expect(await repo.listAll()).toEqual([ROW]);
  });

  it("get returns the row for a kind", async () => {
    const repo = jobSchedulesRepo(createMockDb([ROW]));
    expect(await repo.get("tcgplayer.refresh")).toEqual(ROW);
  });

  it("get returns null for a kind with no schedule", async () => {
    const repo = jobSchedulesRepo(createMockDb([]));
    expect(await repo.get("tcgplayer.refresh")).toBeNull();
  });

  it("upsert resolves", async () => {
    const repo = jobSchedulesRepo(createMockDb([]));
    await expect(repo.upsert("tcgplayer.refresh", "0 6 * * *")).resolves.toBeUndefined();
  });

  it("remove resolves", async () => {
    const repo = jobSchedulesRepo(createMockDb([]));
    await expect(repo.remove("tcgplayer.refresh")).resolves.toBeUndefined();
  });
});
