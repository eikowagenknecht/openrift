import { describe, expect, it } from "vitest";

import { createRecordingDb } from "../../../test/recording-db.js";
import { eventStatusForTournamentStatus } from "./deck-check-shared.js";
import { deckCheckRepo } from "./deck-check.js";

describe("eventStatusForTournamentStatus", () => {
  it("treats setup and running as active (submissions are handed in before start)", () => {
    expect(eventStatusForTournamentStatus("setup")).toBe("active");
    expect(eventStatusForTournamentStatus("running")).toBe("active");
  });

  it("archives only a completed or cancelled tournament", () => {
    expect(eventStatusForTournamentStatus("completed")).toBe("archived");
    expect(eventStatusForTournamentStatus("cancelled")).toBe("archived");
  });
});

describe("deckCheckRepo.deleteEntryCardCopy", () => {
  it("locks the line for update inside a transaction to serialize concurrent decrements", async () => {
    const { db, queries, events } = createRecordingDb([[{ quantity: 2 }], { numAffectedRows: 1n }]);

    const removed = await deckCheckRepo(db).deleteEntryCardCopy("entry-1", "card-1", 0);

    expect(removed).toBe(true);
    expect(events).toEqual(["begin", "commit"]);
    expect(queries[0]).toContain("for update");
    expect(queries[1]).toContain("UPDATE deck_check_entry_cards");
  });

  it("deletes the line when its last copy goes", async () => {
    const { db, queries, events } = createRecordingDb([[{ quantity: 1 }], { numAffectedRows: 1n }]);

    const removed = await deckCheckRepo(db).deleteEntryCardCopy("entry-1", "card-1", 0);

    expect(removed).toBe(true);
    expect(queries[1]).toContain('delete from "deck_check_entry_cards"');
    expect(events).toEqual(["begin", "commit"]);
  });

  it("writes nothing when the copy index is past the line's quantity", async () => {
    const { db, queries } = createRecordingDb([[{ quantity: 2 }]]);

    const removed = await deckCheckRepo(db).deleteEntryCardCopy("entry-1", "card-1", 5);

    expect(removed).toBe(false);
    expect(queries).toHaveLength(1);
  });

  it("returns false when the line is already gone", async () => {
    const { db, queries } = createRecordingDb([[]]);

    const removed = await deckCheckRepo(db).deleteEntryCardCopy("entry-1", "card-1", 0);

    expect(removed).toBe(false);
    expect(queries).toHaveLength(1);
  });
});

describe("deckCheckRepo.updateEntry", () => {
  it("writes the participant and the entry in one transaction", async () => {
    const { db, events, queries } = createRecordingDb([
      [{ participant_id: "participant-1" }],
      { numAffectedRows: 1n },
      [{ id: "entry-1" }],
    ]);

    await deckCheckRepo(db).updateEntry("entry-1", { playerName: "Ekko", state: "checked" });

    expect(events).toEqual(["begin", "commit"]);
    expect(queries[1]).toContain('update "tournament_participants"');
    expect(queries[2]).toContain('update "deck_check_entries"');
  });

  it("rolls back when the entry write fails after the participant write", async () => {
    const { db, events } = createRecordingDb([
      [{ participant_id: "participant-1" }],
      { numAffectedRows: 1n },
      new Error("deadlock detected"),
    ]);

    await expect(
      deckCheckRepo(db).updateEntry("entry-1", { playerName: "Ekko", state: "checked" }),
    ).rejects.toThrow("deadlock detected");
    expect(events).toEqual(["begin", "rollback"]);
  });

  it("reports a missing entry without opening a write", async () => {
    const { db, events, queries } = createRecordingDb([[]]);

    const updated = await deckCheckRepo(db).updateEntry("entry-1", { playerName: "Ekko" });

    expect(updated).toBeUndefined();
    expect(queries).toHaveLength(1);
    expect(events).toEqual(["begin", "commit"]);
  });

  it("skips the transaction entirely when the patch is empty", async () => {
    const { db, events } = createRecordingDb([[]]);

    await deckCheckRepo(db).updateEntry("entry-1", {});

    expect(events).toEqual([]);
  });
});
