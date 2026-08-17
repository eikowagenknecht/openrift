import { describe, expect, it } from "vitest";

import { createRecordingDb } from "../test/recording-db.js";
import {
  cardResolutionKey,
  deckCheckRepo,
  eventStatusForTournamentStatus,
  legendComboResolutions,
} from "./deck-check.js";

describe("eventStatusForTournamentStatus", () => {
  it("treats setup and running as active (submissions are handed in before start)", () => {
    // Regression: a wizard-created deck-check tournament sits in `setup` until
    // round 1 is generated, which never happens when OpenRift is used only for
    // deck check. That must not archive the event or the provider push 409s.
    expect(eventStatusForTournamentStatus("setup")).toBe("active");
    expect(eventStatusForTournamentStatus("running")).toBe("active");
  });

  it("archives only a completed or cancelled tournament", () => {
    expect(eventStatusForTournamentStatus("completed")).toBe("archived");
    expect(eventStatusForTournamentStatus("cancelled")).toBe("archived");
  });
});

describe("legendComboResolutions", () => {
  const azir = { id: "card-azir", normName: "emperorofthesands", tags: ["Azir"] };
  const kindred = { id: "card-kindred", normName: "twinsouls", tags: ["Kindred", "Lamb"] };

  it("resolves the colloquial 'Champion, Title' form", () => {
    const wanted = new Set([cardResolutionKey("Azir, Emperor of the Sands")]);
    expect(legendComboResolutions([azir], wanted)).toEqual([
      { norm: "aziremperorofthesands", cardId: "card-azir" },
    ]);
  });

  it("does not emit a combo whose norm is not requested", () => {
    const wanted = new Set([cardResolutionKey("Emperor of the Sands")]);
    expect(legendComboResolutions([azir], wanted)).toEqual([]);
  });

  it("matches any of a Legend's tags", () => {
    const wanted = new Set([
      cardResolutionKey("Kindred, Twin Souls"),
      cardResolutionKey("Lamb, Twin Souls"),
    ]);
    expect(legendComboResolutions([kindred], wanted)).toEqual([
      { norm: "kindredtwinsouls", cardId: "card-kindred" },
      { norm: "lambtwinsouls", cardId: "card-kindred" },
    ]);
  });

  it("returns nothing for an empty wanted set", () => {
    expect(legendComboResolutions([azir, kindred], new Set())).toEqual([]);
  });

  it("returns nothing for a Legend with no tags", () => {
    const nameless = { id: "card-x", normName: "namelesslegend", tags: [] };
    const wanted = new Set([cardResolutionKey("Nameless Legend")]);
    expect(legendComboResolutions([nameless], wanted)).toEqual([]);
  });
});

describe("deckCheckRepo.deleteEntryCardCopy", () => {
  // Regression: the quantity was read on the bare db and the branch decided in
  // JS. Two judges removing a copy of the same quantity-2 line both read 2, both
  // took the decrement branch, and the second write drove quantity to 0 —
  // surfacing as a 500 from the `quantity > 0` CHECK instead of a no-op.
  it("locks the line for update inside a transaction", async () => {
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
  // Regression: one patch spans tournament_participants and deck_check_entries,
  // and the two writes ran without a transaction — a failure between them left
  // the player renamed on a decklist that kept its old review state.
  it("writes the participant and the entry in one transaction", async () => {
    const { db, events, queries } = createRecordingDb([
      [{ participant_id: "participant-1" }],
      { numAffectedRows: 1n },
      [{ id: "entry-1" }],
    ]);

    // The final read (loadEntryById) runs after the commit and finds nothing
    // here, so the return value is undefined; the writes are what this asserts.
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
