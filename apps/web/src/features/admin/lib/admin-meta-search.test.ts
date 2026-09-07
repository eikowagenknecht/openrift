import { describe, expect, it } from "vitest";

import { metaSearchSchema } from "./admin-meta-search";

describe("metaSearchSchema", () => {
  it("accepts an untouched tab as an empty search", () => {
    expect(metaSearchSchema.parse({})).toEqual({});
  });

  it("drops params it does not own", () => {
    expect(metaSearchSchema.parse({ notMine: "x" })).toEqual({});
  });

  it("accepts the three tabs", () => {
    for (const tab of ["catalogue", "review", "public"]) {
      expect(metaSearchSchema.parse({ tab }).tab).toBe(tab);
    }
  });

  it("rejects an unknown tab", () => {
    expect(metaSearchSchema.safeParse({ tab: "archive" }).success).toBe(false);
  });

  it("coerces the page number out of the URL string", () => {
    expect(metaSearchSchema.parse({ page: "3" }).page).toBe(3);
  });

  it("rejects a page below one", () => {
    expect(metaSearchSchema.safeParse({ page: "0" }).success).toBe(false);
    expect(metaSearchSchema.safeParse({ page: "-1" }).success).toBe(false);
  });

  it("rejects a fractional page", () => {
    expect(metaSearchSchema.safeParse({ page: "1.5" }).success).toBe(false);
  });

  it("accepts every catalogue provider as the source", () => {
    for (const source of ["uvsgames", "playloltcg", "topdeck"]) {
      expect(metaSearchSchema.parse({ source }).source).toBe(source);
    }
  });

  it("rejects an unknown source", () => {
    expect(metaSearchSchema.safeParse({ source: "melee" }).success).toBe(false);
  });

  it("accepts the triage states and the any escape hatch", () => {
    for (const triage of ["new", "accepted", "dismissed", "any"]) {
      expect(metaSearchSchema.parse({ triage }).triage).toBe(triage);
    }
  });

  it("rejects an unknown triage state", () => {
    expect(metaSearchSchema.safeParse({ triage: "pending" }).success).toBe(false);
  });

  it("coerces a playloltcg status out of the URL string", () => {
    expect(metaSearchSchema.parse({ plStatus: "3" }).plStatus).toBe(3);
  });

  it("rejects a playloltcg status outside the known set", () => {
    expect(metaSearchSchema.safeParse({ plStatus: "9" }).success).toBe(false);
    expect(metaSearchSchema.safeParse({ plStatus: "0" }).success).toBe(false);
  });

  it("accepts the catalogue sort columns and directions", () => {
    const parsed = metaSearchSchema.parse({ eventSort: "playerCount", eventDir: "desc" });
    expect(parsed).toMatchObject({ eventSort: "playerCount", eventDir: "desc" });
  });

  it("rejects a sort column that is not a catalogue column", () => {
    expect(metaSearchSchema.safeParse({ eventSort: "createdAt" }).success).toBe(false);
  });

  it("accepts the live sort columns and directions", () => {
    const parsed = metaSearchSchema.parse({ liveSort: "eventDate", liveDir: "asc" });
    expect(parsed).toMatchObject({ liveSort: "eventDate", liveDir: "asc" });
  });

  it("rejects a catalogue sort column on the live tab", () => {
    expect(metaSearchSchema.safeParse({ liveSort: "startAt" }).success).toBe(false);
  });

  it("accepts the non-provider live sources", () => {
    for (const liveSource of ["usersubmission", "manual", "topdeck"]) {
      expect(metaSearchSchema.parse({ liveSource }).liveSource).toBe(liveSource);
    }
  });

  it("accepts zero as the minimum player count", () => {
    expect(metaSearchSchema.parse({ minPlayers: "0" }).minPlayers).toBe(0);
  });

  it("rejects a negative minimum player count", () => {
    expect(metaSearchSchema.safeParse({ minPlayers: "-5" }).success).toBe(false);
  });

  it("keeps the boolean toggles as booleans", () => {
    const parsed = metaSearchSchema.parse({
      decklists: true,
      missing: false,
      awaitingResults: true,
      incompleteStandings: false,
      noDecks: true,
    });
    expect(parsed).toMatchObject({
      decklists: true,
      missing: false,
      awaitingResults: true,
      incompleteStandings: false,
      noDecks: true,
    });
  });

  it("rejects a stringified boolean toggle", () => {
    expect(metaSearchSchema.safeParse({ decklists: "true" }).success).toBe(false);
  });

  it("passes the free-text params through untouched", () => {
    const parsed = metaSearchSchema.parse({
      q: "Summoner Skirmish",
      tdFormat: "standard",
      liveFormat: "constructed",
      dateFrom: "2026-01-01",
      dateTo: "2026-02-01",
    });
    expect(parsed).toMatchObject({
      q: "Summoner Skirmish",
      tdFormat: "standard",
      liveFormat: "constructed",
      dateFrom: "2026-01-01",
      dateTo: "2026-02-01",
    });
  });
});
