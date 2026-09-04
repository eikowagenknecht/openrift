import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  legendFromTopdeckLines,
  projectTopdeckDeckLines,
  projectTournament,
  referencedShortCodes,
  topdeckContentHash,
  topdeckDeckId,
  topdeckEventUrl,
  topdeckFormat,
  topdeckLocalDay,
} from "./topdeck-catalog.js";

const KISSIMMEE = -81.369;

function tournament(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    TID: "summoner-skirmish-4",
    tournamentName: "Summoner Skirmish #4",
    format: "Constructed",
    startDate: 1_765_634_400,
    swissNum: 9,
    topCut: 16,
    eventData: {
      city: "Kissimmee",
      state: "Florida",
      address: "1875 Silver Spur Ln, Kissimmee, FL 34744, USA",
      lat: 28.298,
      lng: KISSIMMEE,
    },
    standings: [],
    ...overrides,
  };
}

function standing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "Ashe Ryder", id: "TUwSHoKJted", wins: 4, losses: 1, draws: 0, ...overrides };
}

describe("topdeckLocalDay", () => {
  it("files an American evening event under the day it was played", () => {
    // 2026-01-03 00:30Z is the evening of the 2nd in Florida.
    const startAt = new Date("2026-01-03T00:30:00.000Z");
    expect(topdeckLocalDay(startAt, KISSIMMEE)).toBe("2026-01-02");
  });

  it("keeps a European late-evening event on its own day", () => {
    const startAt = new Date("2025-10-24T18:30:00.000Z");
    expect(topdeckLocalDay(startAt, 10.33)).toBe("2025-10-24");
  });

  it("falls back to the UTC day for an event with no coordinates", () => {
    const startAt = new Date("2026-01-03T00:30:00.000Z");
    expect(topdeckLocalDay(startAt, null)).toBe("2026-01-03");
  });
});

describe("topdeckFormat", () => {
  it("maps the source's constructed word onto ours", () => {
    expect(topdeckFormat("Constructed")).toBe(WellKnown.deckFormat.CONSTRUCTED);
  });

  it("files every other format as freeform, so a sealed list is not judged as constructed", () => {
    expect(topdeckFormat("Sealed")).toBe(WellKnown.deckFormat.FREEFORM);
    expect(topdeckFormat("2v2")).toBe(WellKnown.deckFormat.FREEFORM);
  });
});

describe("projectTournament", () => {
  it("reads the tournament, its geography and its field size", () => {
    const projection = projectTournament(
      tournament({ standings: [standing(), standing({ name: "Vi Lane", id: "b2" })] }),
    );

    expect(projection?.event).toMatchObject({
      tid: "summoner-skirmish-4",
      name: "Summoner Skirmish #4",
      format: "Constructed",
      swissRounds: 9,
      topCut: 16,
      playerCount: 2,
      isTeamEvent: false,
      city: "Kissimmee",
      state: "Florida",
      country: "US",
      longitude: KISSIMMEE,
    });
    expect(projection?.event.startAt.toISOString()).toBe("2025-12-13T14:00:00.000Z");
  });

  it("reads the country the source names in full where it names one", () => {
    const projection = projectTournament(
      tournament({ eventData: { country: "Mexico", address: "Calle Falsa 123" } }),
    );
    expect(projection?.event.country).toBe("MX");
  });

  it("leaves the country unset when neither field says one", () => {
    const projection = projectTournament(tournament({ eventData: { address: "Online" } }));
    expect(projection?.event.country).toBeNull();
  });

  it("ranks the field by the order the payload lists it", () => {
    const projection = projectTournament(
      tournament({
        standings: [standing({ name: "First" }), standing({ name: "Second", id: "b2" })],
      }),
    );
    expect(projection?.standings.map((row) => [row.rank, row.playerName])).toEqual([
      [1, "First"],
      [2, "Second"],
    ]);
  });

  it("keys a standing by the source's account id", () => {
    const projection = projectTournament(tournament({ standings: [standing({ id: "acct-7" })] }));
    expect(projection?.standings[0]?.playerKey).toBe("uacct-7");
  });

  it("numbers same-named rows when the source gives no id, so a shared name is two seats", () => {
    const projection = projectTournament(
      tournament({
        standings: [
          standing({ name: "Ashe Ryder", id: undefined }),
          standing({ name: "Ashe Ryder", id: undefined }),
        ],
      }),
    );
    expect(projection?.standings.map((row) => row.playerKey)).toEqual([
      "nAshe Ryder#1",
      "nAshe Ryder#2",
    ]);
  });

  it("gives a deck id only to a standing that submitted a list", () => {
    const projection = projectTournament(
      tournament({
        standings: [
          standing({ deckObj: { Mainboard: { Gust: { id: "OGN-101", count: 3 } } } }),
          standing({ id: "b2" }),
        ],
      }),
    );
    expect(projection?.standings[0]?.sourceDeckId).toBe(
      topdeckDeckId("summoner-skirmish-4", "uTUwSHoKJted"),
    );
    expect(projection?.standings[1]?.sourceDeckId).toBeNull();
  });

  it("drops a row the source gave no id or name", () => {
    expect(projectTournament(tournament({ TID: "" }))).toBeNull();
    expect(projectTournament(tournament({ startDate: "yesterday" }))).toBeNull();
    expect(projectTournament("not an object")).toBeNull();
  });

  it("hashes over the projection's own fields, not the source's key order", () => {
    const a = projectTournament(tournament());
    const b = projectTournament({ standings: [], ...tournament() });
    expect(a?.event.contentHash).toBe(b?.event.contentHash);
  });

  it("reads a field that grew as a change", () => {
    const one = projectTournament(tournament({ standings: [standing()] }));
    const two = projectTournament(
      tournament({ standings: [standing(), standing({ id: "b2", name: "Vi Lane" })] }),
    );
    expect(one?.event.contentHash).not.toBe(two?.event.contentHash);
  });
});

describe("topdeckContentHash", () => {
  it("is stable for the same values", () => {
    const fields = projectTournament(tournament())?.event;
    expect(fields).toBeDefined();
    const { contentHash, ...rest } = fields as NonNullable<typeof fields>;
    expect(topdeckContentHash(rest)).toBe(contentHash);
  });
});

describe("referencedShortCodes", () => {
  it("collects every code the decks name, and skips the metadata section", () => {
    const projection = projectTournament(
      tournament({
        standings: [
          standing({
            deckObj: {
              Legend: { "Blind Monk": { id: "OGN-001", count: 1 } },
              Mainboard: { Gust: { id: "OGN-101", count: 3 } },
              metadata: { game: "Riftbound", format: "Constructed" },
            },
          }),
        ],
      }),
    );
    expect(referencedShortCodes(projection?.standings ?? []).toSorted()).toEqual([
      "OGN-001",
      "OGN-101",
    ]);
  });

  it("skips an id that is a uuid rather than a printing code", () => {
    const projection = projectTournament(
      tournament({
        standings: [
          standing({
            deckObj: {
              Mainboard: { Gust: { id: "919ae049-0778-4f7a-853e-fd162dc8a224", count: 3 } },
            },
          }),
        ],
      }),
    );
    expect(referencedShortCodes(projection?.standings ?? [])).toEqual([]);
  });
});

describe("projectTopdeckDeckLines", () => {
  const bridge = new Map([
    ["OGN-001", { cardId: "card-legend", name: "Blind Monk", type: "legend" }],
    ["OGN-050", { cardId: "card-champ", name: "Lee Sin, Dragon's Rage", type: "unit" }],
  ]);

  it("places each card in the zone the source's own section names", () => {
    const lines = projectTopdeckDeckLines(
      {
        Legend: { "Lee Sin, Blind Monk": { id: "OGN-001", count: 1 } },
        Champion: { "Lee Sin, Dragon's Rage": { id: "OGN-050", count: 1 } },
        Runes: { "Body Rune": { count: 6 } },
        Battlefields: { "Obelisk of Power": { count: 1 } },
        Mainboard: { Gust: { count: 3 } },
        Sideboard: { Rebuke: { count: 2 } },
      },
      bridge,
    );

    expect(lines.map((line) => [line.zone, line.cardName, line.quantity])).toEqual([
      [WellKnown.deckZone.LEGEND, "Blind Monk", 1],
      [WellKnown.deckZone.CHAMPION, "Lee Sin, Dragon's Rage", 1],
      [WellKnown.deckZone.RUNES, "Body Rune", 6],
      [WellKnown.deckZone.BATTLEFIELD, "Obelisk of Power", 1],
      [WellKnown.deckZone.MAIN, "Gust", 3],
      [WellKnown.deckZone.SIDEBOARD, "Rebuke", 2],
    ]);
  });

  it("takes our catalogue's spelling for a card whose code resolves", () => {
    const lines = projectTopdeckDeckLines(
      { Legend: { "Lee Sin, Blind Monk": { id: "OGN-001", count: 1 } } },
      bridge,
    );
    expect(lines[0]?.cardName).toBe("Blind Monk");
  });

  it("keeps the source's spelling for a card with no code to resolve", () => {
    const lines = projectTopdeckDeckLines(
      { Legend: { "Rengar, Pridestalker": { count: 1 } } },
      bridge,
    );
    expect(lines[0]?.cardName).toBe("Rengar, Pridestalker");
  });

  it("skips the metadata section, whose values are strings rather than cards", () => {
    const lines = projectTopdeckDeckLines(
      { metadata: { game: "Riftbound" }, Mainboard: { Gust: { count: 3 } } },
      bridge,
    );
    expect(lines).toHaveLength(1);
  });

  it("accepts the section names the source spells differently on older lists", () => {
    const lines = projectTopdeckDeckLines(
      { "Main Deck": { Gust: { count: 3 } }, "Rune Pool": { "Body Rune": { count: 6 } } },
      bridge,
    );
    expect(lines.map((line) => line.zone)).toEqual([
      WellKnown.deckZone.MAIN,
      WellKnown.deckZone.RUNES,
    ]);
  });

  it("drops a line with no usable quantity", () => {
    const lines = projectTopdeckDeckLines(
      { Mainboard: { Gust: { count: 0 }, Sabotage: { count: "three" }, Rebuke: { count: 2 } } },
      bridge,
    );
    expect(lines.map((line) => line.cardName)).toEqual(["Rebuke"]);
  });

  it("numbers lines from zero, which is what the mirror's key expects", () => {
    const lines = projectTopdeckDeckLines(
      { Mainboard: { Gust: { count: 3 }, Rebuke: { count: 2 } } },
      bridge,
    );
    expect(lines.map((line) => line.lineNumber)).toEqual([0, 1]);
  });
});

describe("legendFromTopdeckLines", () => {
  it("reads the legend off the deck's own Legend line", () => {
    const lines = projectTopdeckDeckLines(
      {
        Legend: { "Lee Sin, Blind Monk": { count: 1 } },
        Mainboard: { Gust: { count: 3 } },
      },
      new Map(),
    );
    expect(legendFromTopdeckLines(lines)).toBe("Lee Sin, Blind Monk");
  });

  it("says nothing for a list with no legend line", () => {
    const lines = projectTopdeckDeckLines({ Mainboard: { Gust: { count: 3 } } }, new Map());
    expect(legendFromTopdeckLines(lines)).toBeNull();
  });
});

describe("topdeckEventUrl", () => {
  it("points at the source's own page for the event", () => {
    expect(topdeckEventUrl("summoner-skirmish-4")).toBe(
      "https://topdeck.gg/event/summoner-skirmish-4",
    );
  });
});
