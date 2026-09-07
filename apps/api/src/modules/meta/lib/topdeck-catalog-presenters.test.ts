import { describe, expect, it } from "vitest";

import type { TopdeckListRow } from "../repositories/topdeck-events.js";
import { toTopdeckCatalogRow } from "./topdeck-catalog-presenters.js";

const NOW = new Date("2026-09-04T12:00:00Z");

function row(overrides: Partial<TopdeckListRow> = {}): TopdeckListRow {
  return {
    tid: "summoner-skirmish-4",
    name: "Summoner Skirmish #4",
    format: "Constructed",
    startAt: new Date("2026-01-03T00:30:00.000Z"),
    swissRounds: 9,
    topCut: 16,
    playerCount: 64,
    isTeamEvent: false,
    teamSize: null,
    city: "Kissimmee",
    state: "Florida",
    country: "US",
    address: "1875 Silver Spur Ln",
    longitude: -81.369,
    latitude: 28.298,
    contentHash: "hash",
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    triage: "accepted",
    metaEventId: "live-1",
    metaEventSlug: "summoner-skirmish-4",
    fetchedAt: NOW,
    stagedPlayerCount: 64,
    stagedLegendCount: 60,
    stagedDeckCount: 40,
    rivalProvider: null,
    ...overrides,
  };
}

describe("toTopdeckCatalogRow", () => {
  it("hands the table the source's own format word and its geography", () => {
    expect(toTopdeckCatalogRow(row())).toMatchObject({
      tid: "summoner-skirmish-4",
      format: "Constructed",
      city: "Kissimmee",
      country: "US",
      playerCount: 64,
      topCut: 16,
      isTeamEvent: false,
    });
  });

  it("hands instants over as ISO strings", () => {
    const presented = toTopdeckCatalogRow(row());
    expect(presented.startAt).toBe("2026-01-03T00:30:00.000Z");
    expect(presented.fetchedAt).toBe(NOW.toISOString());
  });

  it("says nothing about a fetch or a disappearance that has not happened", () => {
    const presented = toTopdeckCatalogRow(row({ fetchedAt: null, missingSince: null }));
    expect(presented.fetchedAt).toBeNull();
    expect(presented.missingSince).toBeNull();
  });

  it("links the source's own page for the event", () => {
    expect(toTopdeckCatalogRow(row()).sourceUrl).toBe(
      "https://topdeck.gg/event/summoner-skirmish-4",
    );
  });

  it("names the provider that won a live event this row only cites", () => {
    expect(toTopdeckCatalogRow(row({ rivalProvider: "uvsgames" })).rivalProvider).toBe("uvsgames");
  });
});
