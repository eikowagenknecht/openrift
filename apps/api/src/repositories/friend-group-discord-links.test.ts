import { describe, expect, it } from "vitest";

import { createRecordingDb } from "../test/recording-db.js";
import { friendGroupDiscordLinksRepo } from "./friend-group-discord-links.js";

const PENDING_ROW = {
  id: "link-pending",
  group_id: "group-a",
  guild_id: null,
  guild_name: null,
  code: "abc123",
  code_expires_at: new Date("2099-01-01T00:00:00.000Z"),
  created_by_user_id: "user-1",
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  linked_at: null,
  trade_channel_ids: [],
};

const LINKED_ROW = {
  ...PENDING_ROW,
  guild_id: "guild-1",
  guild_name: "Summoner Skirmish",
  code: null,
  code_expires_at: null,
  linked_at: new Date("2026-01-02T00:00:00.000Z"),
};

const REDEEM = { code: "abc123", guildId: "guild-1", guildName: "Summoner Skirmish" } as const;

describe("friendGroupDiscordLinksRepo.redeemCode", () => {
  // Regression: the redeem used to be four statements on the bare db. Two
  // concurrent redeems of the same one-time code could both pass the pending
  // check, and a crash between statements left a spent code alive. Locking the
  // pending row inside a transaction is what serializes them.
  it("claims the pending row with a lock inside one transaction", async () => {
    const { db, queries, events } = createRecordingDb([[PENDING_ROW], [], [LINKED_ROW]]);

    const result = await friendGroupDiscordLinksRepo(db).redeemCode(REDEEM);

    expect(result.status).toBe("linked");
    expect(events).toEqual(["begin", "commit"]);
    expect(queries[0]).toContain("for update");
    expect(queries).toHaveLength(3);
  });

  // The crash-window invariant: a failure part-way through must undo the claim,
  // so the code is either fully spent or still redeemable — never both gone and
  // unlinked.
  it("rolls back when a statement fails after the code was claimed", async () => {
    const { db, queries, events } = createRecordingDb([
      [PENDING_ROW],
      [],
      new Error("connection reset"),
    ]);

    await expect(friendGroupDiscordLinksRepo(db).redeemCode(REDEEM)).rejects.toThrow(
      "connection reset",
    );
    expect(events).toEqual(["begin", "rollback"]);
    expect(queries).toHaveLength(3);
  });

  // The loser of a concurrent redeem re-checks the qualifier once the winner's
  // lock lifts, no longer matches, and must report unknown-code rather than
  // binding a second guild to a spent code.
  it("reports unknown-code when the pending row is already consumed", async () => {
    const { db, queries, events } = createRecordingDb([[]]);

    const result = await friendGroupDiscordLinksRepo(db).redeemCode(REDEEM);

    expect(result).toEqual({ status: "unknown-code" });
    expect(events).toEqual(["begin", "commit"]);
    expect(queries).toHaveLength(1);
  });

  it("leaves the code unspent when the guild belongs to another group", async () => {
    const { db, queries, events } = createRecordingDb([
      [PENDING_ROW],
      [{ ...LINKED_ROW, id: "link-other", group_id: "group-b" }],
    ]);

    const result = await friendGroupDiscordLinksRepo(db).redeemCode(REDEEM);

    expect(result).toEqual({ status: "guild-taken" });
    // Only the two locking reads ran: no write touched the pending row.
    expect(queries).toHaveLength(2);
    expect(events).toEqual(["begin", "commit"]);
  });

  it("refreshes the existing link and drops the pending row on a re-link", async () => {
    const { db, queries } = createRecordingDb([
      [PENDING_ROW],
      [{ ...LINKED_ROW, id: "link-live" }],
      [{ ...LINKED_ROW, id: "link-live" }],
      [],
    ]);

    const result = await friendGroupDiscordLinksRepo(db).redeemCode(REDEEM);

    expect(result).toEqual({
      status: "linked",
      link: expect.objectContaining({ id: "link-live" }),
    });
    expect(queries[2]).toContain("update");
    expect(queries[3]).toContain("delete from");
  });
});
