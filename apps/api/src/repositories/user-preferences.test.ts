import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { createRecordingDb } from "../test/recording-db.js";
import { userPreferencesRepo } from "./user-preferences.js";

/** The row an upsert's RETURNING gives back; content is irrelevant to these tests. */
const STORED_ROW = [
  {
    user_id: "u1",
    data: { theme: "dark" },
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
  },
];

describe("userPreferencesRepo", () => {
  it("getByUserId returns undefined when not found", async () => {
    const db = createMockDb([]);
    const repo = userPreferencesRepo(db);
    expect(await repo.getByUserId("u1")).toBeUndefined();
  });

  it("getByUserId returns parsed preferences when found", async () => {
    const data = { theme: "dark" };
    const db = createMockDb([{ userId: "u1", data, createdAt: new Date(), updatedAt: new Date() }]);
    const repo = userPreferencesRepo(db);
    const result = await repo.getByUserId("u1");
    expect(result).toBeDefined();
    expect(result!.data).toEqual(data);
  });

  // Regression: upsert used to read the row, merge in JS, and write the result
  // back. Two PATCHes overlapping in time each wrote the snapshot they had read,
  // so the later commit silently dropped the earlier one's keys. The merge now
  // happens inside the one statement, which leaves no window to lose.
  it("upsert reads nothing first and merges in a single statement", async () => {
    const { db, queries, parameters } = createRecordingDb([STORED_ROW]);

    const result = await userPreferencesRepo(db).upsert("u1", { theme: "dark" });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("(user_preferences.data || excluded.data)");
    expect(parameters[0]).toEqual(["u1", { theme: "dark" }, []]);
    expect(result).toEqual({ theme: "dark" });
  });

  // jsonb params are handed to the driver as values, never as JSON text —
  // stringifying here would double-encode into a jsonb string scalar.
  it("upsert binds the patch as an object, not as JSON text", async () => {
    const { db, parameters } = createRecordingDb([STORED_ROW]);

    await userPreferencesRepo(db).upsert("u1", { theme: "dark", showImages: false });

    expect(parameters[0][1]).toEqual({ theme: "dark", showImages: false });
  });

  it("upsert sends null keys as jsonb key removals", async () => {
    const { db, queries, parameters } = createRecordingDb([STORED_ROW]);

    await userPreferencesRepo(db).upsert("u1", { theme: null, showImages: true });

    expect(queries[0]).toContain("::text[]");
    expect(parameters[0]).toEqual(["u1", { showImages: true }, ["theme"]]);
  });

  it("upsert skips undefined keys", async () => {
    const { db, parameters } = createRecordingDb([STORED_ROW]);

    await userPreferencesRepo(db).upsert("u1", { theme: undefined });

    expect(parameters[0]).toEqual(["u1", {}, []]);
  });

  // The channel is opt-out, so an admin who has never opened the profile page
  // has no preferences row at all and must still be mailed. An inner join (what
  // the two opt-in recipient queries use) would silently drop exactly them.
  it("listGroupJoinRequestRecipients left-joins preferences and excludes only an explicit false", async () => {
    const { db, queries, parameters } = createRecordingDb([[]]);

    await userPreferencesRepo(db).listGroupJoinRequestRecipients("g1");

    expect(queries[0]).toContain('left join "user_preferences"');
    expect(queries[0]).toContain("IS DISTINCT FROM 'false'");
    expect(parameters[0]).toEqual(["g1", "owner", "admin", true]);
  });
});
