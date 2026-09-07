import { describe, expect, it } from "vitest";

import type { MetaEventCorrectionTarget } from "./meta-event-correction-review";
import { metaEventCorrectionRows } from "./meta-event-correction-review";

const event: MetaEventCorrectionTarget = {
  name: "Summoner Skirmish Berlin",
  eventDate: "2026-08-15",
  format: "constructed",
  playerCount: 64,
  organizer: "Rift Games Berlin",
  location: null,
  country: "DE",
};

describe("metaEventCorrectionRows", () => {
  it("lists only the fields a correction proposes a value for", () => {
    expect(metaEventCorrectionRows({ playerCount: 48 }, event)).toEqual([
      { field: "playerCount", label: "Players", current: "64", proposed: "48" },
    ]);
  });

  it("keeps the event page's reading order rather than the sender's", () => {
    const rows = metaEventCorrectionRows({ country: "FR", name: "Skirmish Lyon" }, event);
    expect(rows.map((row) => row.field)).toEqual(["name", "country"]);
  });

  it("marks a fact the archive has none of rather than printing an empty cell", () => {
    const rows = metaEventCorrectionRows({ location: "Ionia Hall" }, event);
    expect(rows[0]!.current).toBe("—");
    expect(rows[0]!.proposed).toBe("Ionia Hall");
  });

  it("still lists the proposals when the event has been deleted", () => {
    const rows = metaEventCorrectionRows({ playerCount: 48 }, null);
    expect(rows).toEqual([
      { field: "playerCount", label: "Players", current: "—", proposed: "48" },
    ]);
  });

  it("reads an empty edit set as nothing proposed", () => {
    expect(metaEventCorrectionRows({}, event)).toEqual([]);
  });
});
