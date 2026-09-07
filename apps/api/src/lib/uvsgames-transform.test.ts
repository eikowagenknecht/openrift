import { describe, expect, it } from "vitest";

import type { UvsDeepFetchResponses } from "./uvsgames-transform.js";
import {
  completedRounds,
  projectPhases,
  projectRoundMatches,
  listStatusFor,
  readDeckLines,
  referencedDeckIds,
  projectUvsStandings,
  withSingleChampion,
} from "./uvsgames-transform.js";

function registration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 900,
    best_identifier: "Ashwalker",
    matches_won: 5,
    matches_lost: 1,
    matches_drawn: 0,
    final_place_in_standings: 1,
    deck_id: null,
    ...overrides,
  };
}

/** The shape all but a few dozen real lists have: no legend, champion or battlefields. */
function raw(overrides: Partial<UvsDeepFetchResponses> = {}): UvsDeepFetchResponses {
  return {
    detail: { name: "Summoner Skirmish Regional" },
    registrations: [registration()],
    standings: [],
    roundStandings: [],
    ...overrides,
  };
}

describe("projectUvsStandings", () => {
  it("drops a registration with no name or no placement, and counts it", () => {
    const { standings, dropped } = projectUvsStandings(
      raw({
        registrations: [
          registration(),
          registration({ id: 901, best_identifier: null }),
          registration({ id: 902, final_place_in_standings: null }),
        ],
      }),
    );

    expect(standings).toHaveLength(1);
    expect(dropped).toBe(2);
  });

  it("refuses a tv-standings rank when the display name is not unique", () => {
    const { standings, dropped } = projectUvsStandings(
      raw({
        registrations: [registration({ final_place_in_standings: null })],
        standings: [
          { rank: 4, tv_display_name: "Ashwalker" },
          { rank: 9, tv_display_name: "Ashwalker" },
        ],
      }),
    );

    expect(standings).toHaveLength(0);
    expect(dropped).toBe(1);
  });
});

describe("projectUvsStandings player identities", () => {
  it("names the source's user behind each registration, keyed by the staged row's id", () => {
    const { players } = projectUvsStandings(
      raw({
        registrations: [
          registration({ id: 900, best_identifier: "Ashwalker", user: { id: 41 } }),
          registration({
            id: 901,
            best_identifier: "Riftwalker",
            final_place_in_standings: 2,
            user: { id: 42 },
          }),
        ],
      }),
    );

    expect(players).toEqual([
      { registrationId: "900", userId: 41, displayName: "Ashwalker" },
      { registrationId: "901", userId: 42, displayName: "Riftwalker" },
    ]);
  });

  it("takes the registration's own handle as the display name, not the standings name", () => {
    const { players } = projectUvsStandings(
      raw({
        registrations: [registration({ best_identifier: "Ashwalker", user: { id: 41 } })],
        standings: [{ tv_display_name: "Real Name", rank: 1 }],
      }),
    );

    expect(players).toEqual([{ registrationId: "900", userId: 41, displayName: "Ashwalker" }]);
  });

  it("still stages the standings row for a registration the source gives no usable user id", () => {
    for (const user of [undefined, {}, { id: 0 }, { id: -1 }, { id: 4.5 }, { id: "41" }]) {
      const { standings, players } = projectUvsStandings(
        raw({ registrations: [registration({ user })] }),
      );

      expect(players).toEqual([]);
      expect(standings).toHaveLength(1);
    }
  });

  it("has no identity for a registration that was dropped for want of a placement", () => {
    const { standings, players } = projectUvsStandings(
      raw({
        registrations: [registration({ final_place_in_standings: null, user: { id: 41 } })],
      }),
    );

    expect(players).toEqual([]);
    expect(standings).toEqual([]);
  });
});

describe("completedRounds", () => {
  it("lists the finished rounds with their phase and round positions", () => {
    const rounds = completedRounds({
      tournament_phases: [
        {
          rounds: [
            { id: 1, status: "complete", round_number: 1 },
            { id: 2, status: "in_progress", round_number: 2 },
          ],
        },
        { rounds: [{ id: 3, status: "COMPLETED" }] },
      ],
    });

    expect(rounds).toEqual([
      { roundId: "1", phaseOrder: 0, roundNumber: 1 },
      { roundId: "3", phaseOrder: 1, roundNumber: 1 },
    ]);
  });

  it("falls back to the list position when the source names no round number", () => {
    const rounds = completedRounds({
      tournament_phases: [
        {
          rounds: [
            { id: 7, status: "complete" },
            { id: 8, status: "complete" },
          ],
        },
      ],
    });

    expect(rounds.map((round) => round.roundNumber)).toEqual([1, 2]);
  });

  it("numbers a phase by position rather than repeat a number the source skipped", () => {
    const rounds = completedRounds({
      tournament_phases: [
        {
          rounds: [
            { id: 7, status: "complete", round_number: 2 },
            { id: 8, status: "complete" },
          ],
        },
      ],
    });

    expect(rounds.map((round) => round.roundNumber)).toEqual([1, 2]);
  });

  it("numbers a phase by position when the source repeats a round number", () => {
    const rounds = completedRounds({
      tournament_phases: [
        {
          rounds: [
            { id: 7, status: "complete", round_number: 1 },
            { id: 8, status: "complete", round_number: 1 },
          ],
        },
      ],
    });

    expect(rounds.map((round) => round.roundNumber)).toEqual([1, 2]);
  });

  it("keeps the source's numbering when it skips an unfinished round", () => {
    const rounds = completedRounds({
      tournament_phases: [
        {
          rounds: [
            { id: 7, status: "in_progress", round_number: 1 },
            { id: 8, status: "complete", round_number: 2 },
          ],
        },
      ],
    });

    expect(rounds).toEqual([{ roundId: "8", phaseOrder: 0, roundNumber: 2 }]);
  });

  it("is empty for a detail row with no phases", () => {
    expect(completedRounds({})).toEqual([]);
    expect(completedRounds(null)).toEqual([]);
  });
});

const ROUND = { roundId: "303067", phaseOrder: 1, roundNumber: 3 };

function seat(userId: number, extra: Record<string, unknown> = {}) {
  return {
    user_event_status: { user: { id: userId, best_identifier: `Player ${userId}` } },
    ...extra,
  };
}

describe("projectPhases", () => {
  const RQ_PHASES = [
    {
      id: 793_560,
      phase_name: "Phase 1",
      order_in_phases: 1,
      number_of_rounds: 8,
      round_type: "SWISS",
      rank_required_to_enter_phase: null,
      effective_maximum_number_of_game_wins_per_match: 2,
    },
    {
      id: 793_562,
      phase_name: "Phase 3",
      order_in_phases: 3,
      number_of_rounds: 3,
      round_type: "RANKED_SINGLE_ELIMINATION",
      rank_required_to_enter_phase: 8,
      effective_maximum_number_of_game_wins_per_match: 2,
    },
  ];

  it("keeps the structure that gives a phase order its meaning", () => {
    expect(projectPhases({ tournament_phases: RQ_PHASES })).toEqual([
      {
        phaseOrder: 0,
        name: "Phase 1",
        roundType: "SWISS",
        roundCount: 8,
        rankRequired: null,
        maxGameWins: 2,
      },
      {
        phaseOrder: 1,
        name: "Phase 3",
        roundType: "RANKED_SINGLE_ELIMINATION",
        roundCount: 3,
        rankRequired: 8,
        maxGameWins: 2,
      },
    ]);
  });

  it("numbers phases from zero by position, not by the source's one-based order field", () => {
    const phases = projectPhases({ tournament_phases: RQ_PHASES });
    expect(phases.map((phase) => phase.phaseOrder)).toEqual([0, 1]);
  });

  it("skips a phase with no round type and keeps the rest in place", () => {
    const phases = projectPhases({
      tournament_phases: [{ phase_name: "Unconfigured" }, RQ_PHASES[1]],
    });

    expect(phases).toHaveLength(1);
    expect(phases[0]).toMatchObject({ phaseOrder: 1, rankRequired: 8 });
  });

  it("reads a Bo1 phase as one game win", () => {
    const phases = projectPhases({
      tournament_phases: [
        { round_type: "SWISS", effective_maximum_number_of_game_wins_per_match: 1 },
      ],
    });

    expect(phases[0]!.maxGameWins).toBe(1);
  });

  it("has nothing to project from a detail with no phases", () => {
    expect(projectPhases(null)).toEqual([]);
    expect(projectPhases({})).toEqual([]);
  });
});

describe("projectRoundMatches", () => {
  it("projects a played match with participants ordered by user id", () => {
    const { matches, players, dropped } = projectRoundMatches(ROUND, [
      {
        id: 7001,
        table_number: 4,
        winning_player: 90,
        games_won_by_winner: 2,
        games_won_by_loser: 1,
        player_match_relationships: [seat(120), seat(90)],
      },
    ]);

    expect(dropped).toBe(0);
    expect(matches).toEqual([
      {
        sourceMatchId: "7001",
        roundId: "303067",
        phaseOrder: 1,
        roundNumber: 3,
        tableNumber: 4,
        isBye: false,
        isDraw: false,
        player1UvsgamesId: 90,
        player2UvsgamesId: 120,
        winnerUvsgamesId: 90,
        gamesWonP1: 2,
        gamesWonP2: 1,
      },
    ]);
    expect(players.get(90)).toBe("Player 90");
    expect(players.get(120)).toBe("Player 120");
  });

  it("leaves a seat name whole, since the player upsert is what bounds it", () => {
    const long = "N".repeat(200);
    const { players } = projectRoundMatches(ROUND, [
      {
        id: 7009,
        match_is_bye: true,
        player_match_relationships: [
          { user_event_status: { best_identifier: long, user: { id: 90 } } },
        ],
      },
    ]);

    expect(players.get(90)).toBe(long);
  });

  it("names a seat by its handle, not the account name behind it", () => {
    const { players } = projectRoundMatches(ROUND, [
      {
        id: 7002,
        table_number: 1,
        winning_player: 166_747,
        player_match_relationships: [
          {
            player: { id: 166_747, best_identifier: "Luna D" },
            user_event_status: {
              best_identifier: "ElayneFurie",
              user: { id: 166_747, best_identifier: "Luna D" },
            },
          },
          {
            player: { id: 99_966, best_identifier: "Marc R" },
            user_event_status: {
              best_identifier: "Ruizo",
              user: { id: 99_966, best_identifier: "Marc R" },
            },
          },
        ],
      },
    ]);

    expect(players.get(166_747)).toBe("ElayneFurie");
    expect(players.get(99_966)).toBe("Ruizo");
  });

  it("keeps a bye as a single-seat row with no table", () => {
    const { matches, dropped } = projectRoundMatches(ROUND, [
      {
        id: 7003,
        table_number: -1,
        match_is_bye: true,
        winning_player: 55,
        player_match_relationships: [seat(55, { games_won: 2, is_winner: true })],
      },
    ]);

    expect(dropped).toBe(0);
    expect(matches).toEqual([
      {
        sourceMatchId: "7003",
        roundId: "303067",
        phaseOrder: 1,
        roundNumber: 3,
        tableNumber: null,
        isBye: true,
        isDraw: false,
        player1UvsgamesId: 55,
        player2UvsgamesId: null,
        winnerUvsgamesId: 55,
        gamesWonP1: 2,
        gamesWonP2: null,
      },
    ]);
  });

  it("marks a draw and leaves the winner and game counts null", () => {
    const { matches } = projectRoundMatches(ROUND, [
      {
        id: 7004,
        table_number: 2,
        match_is_unintentional_draw: true,
        player_match_relationships: [seat(7), seat(9)],
      },
    ]);

    expect(matches[0]?.isDraw).toBe(true);
    expect(matches[0]?.winnerUvsgamesId).toBeNull();
    expect(matches[0]?.gamesWonP1).toBeNull();
  });

  it("drops what it cannot represent instead of guessing", () => {
    const { matches, dropped } = projectRoundMatches(ROUND, [
      // No readable seat at all.
      { id: 8001, table_number: 1, player_match_relationships: [{ player: {} }] },
      // A non-bye whose opponent seat is unreadable.
      {
        id: 8002,
        table_number: 2,
        player_match_relationships: [seat(11), { player: {} }],
      },
      // Three seats.
      {
        id: 8003,
        table_number: 3,
        player_match_relationships: [seat(21), seat(22), seat(23)],
      },
      // No id to key the row on.
      { table_number: 4, winning_player: 31, player_match_relationships: [seat(31), seat(32)] },
      {
        id: 8005,
        table_number: 5,
        winning_player: 41,
        player_match_relationships: [seat(41), seat(42)],
      },
    ]);

    expect(matches).toHaveLength(1);
    expect(dropped).toBe(4);
  });

  it("keeps both matches when a player is paired twice in one round", () => {
    const { matches, dropped } = projectRoundMatches(ROUND, [
      {
        id: 8101,
        table_number: 4,
        winning_player: 31,
        player_match_relationships: [seat(31), seat(32)],
      },
      {
        id: 8102,
        table_number: 5,
        winning_player: 31,
        player_match_relationships: [seat(31), seat(33)],
      },
    ]);

    expect(dropped).toBe(0);
    expect(matches.map((match) => match.sourceMatchId)).toEqual(["8101", "8102"]);
    expect(matches.map((match) => match.player1UvsgamesId)).toEqual([31, 31]);
  });

  it("reads the legacy seat shape and its per-seat game counts", () => {
    const { matches } = projectRoundMatches(ROUND, [
      {
        id: 7005,
        table_number: 8,
        winning_player: 61,
        players: [
          { player: { id: 61, best_identifier: "Hanzel R" }, games_won: 2, is_winner: true },
          { player: { id: 44, best_identifier: "David M" }, games_won: 1 },
        ],
      },
    ]);

    expect(matches).toEqual([
      {
        sourceMatchId: "7005",
        roundId: "303067",
        phaseOrder: 1,
        roundNumber: 3,
        tableNumber: 8,
        isBye: false,
        isDraw: false,
        player1UvsgamesId: 44,
        player2UvsgamesId: 61,
        winnerUvsgamesId: 61,
        gamesWonP1: 1,
        gamesWonP2: 2,
      },
    ]);
  });
});

describe("referencedDeckIds", () => {
  it("dedupes the deck ids the registrations point at", () => {
    expect(
      referencedDeckIds([
        { deck_id: "a" },
        { deck_id: null },
        { deck_id: "a" },
        { deck_id: "b" },
        "junk",
      ]),
    ).toEqual(["a", "b"]);
  });
});

describe("readDeckLines", () => {
  it("returns null for a deck with no readable card line", () => {
    expect(readDeckLines(null)).toBeNull();
    expect(
      readDeckLines({ sections: [{ section_type: "main", cards: [{ quantity: 2 }] }] }),
    ).toBeNull();
  });

  it("defaults a missing quantity to one copy", () => {
    const lines = readDeckLines({
      sections: [{ section_type: "main", cards: [{ name: "Poro" }] }],
    });

    expect(lines?.cards).toEqual([{ name: "Poro", zone: "main", quantity: 1 }]);
  });
});

describe("listStatusFor", () => {
  const complete = [
    { name: "Yasuo", zone: "legend", quantity: 1 },
    { name: "Sivir", zone: "champion", quantity: 1 },
    { name: "Rune", zone: "runes", quantity: 12 },
    { name: "Field", zone: "battlefield", quantity: 3 },
    { name: "Poro", zone: "main", quantity: 39 },
  ];

  it("calls a list holding every zone full", () => {
    expect(listStatusFor(complete, null)).toBe("full");
  });

  it("calls a list short of its main deck partial", () => {
    const short = [
      ...complete.filter((line) => line.zone !== "main"),
      { name: "Poro", zone: "main", quantity: 30 },
    ];

    expect(listStatusFor(short, null)).toBe("partial");
  });

  it("calls a list with no champion partial however long its main deck", () => {
    const noChampion = [
      ...complete.filter((line) => line.zone !== "champion" && line.zone !== "main"),
      { name: "Poro", zone: "main", quantity: 47 },
    ];

    expect(listStatusFor(noChampion, null)).toBe("partial");
  });

  it("credits the standings legend to a list carrying no legend zone", () => {
    const noLegend = complete.filter((line) => line.zone !== "legend");

    expect(listStatusFor(noLegend, null)).toBe("partial");
    expect(listStatusFor(noLegend, "Yasuo, the Unforgiven")).toBe("full");
  });

  it("reads a normalised playset as the complete list it is", () => {
    const playset = withSingleChampion([
      ...complete.filter((line) => line.zone !== "champion" && line.zone !== "main"),
      { name: "Sivir", zone: "champion", quantity: 3 },
      { name: "Poro", zone: "main", quantity: 37 },
    ]);

    expect(listStatusFor(playset, null)).toBe("full");
  });
});

describe("withSingleChampion", () => {
  it("leaves a single-copy champion where the source filed it", () => {
    const lines = [{ name: "Sivir", zone: "champion", quantity: 1 }];

    expect(withSingleChampion(lines)).toEqual(lines);
  });

  it("seats one copy and sends the rest of the playset to the main deck", () => {
    expect(withSingleChampion([{ name: "Sivir", zone: "champion", quantity: 3 }])).toEqual([
      { name: "Sivir", zone: "champion", quantity: 1 },
      { name: "Sivir", zone: "main", quantity: 2 },
    ]);
  });

  it("seats only the first champion line when a source files two", () => {
    expect(
      withSingleChampion([
        { name: "Sivir", zone: "champion", quantity: 1 },
        { name: "Rumble", zone: "champion", quantity: 2 },
      ]),
    ).toEqual([
      { name: "Sivir", zone: "champion", quantity: 1 },
      { name: "Rumble", zone: "main", quantity: 2 },
    ]);
  });

  it("leaves every other zone alone", () => {
    const lines = [
      { name: "Yasuo", zone: "legend", quantity: 1 },
      { name: "Rune", zone: "runes", quantity: 12 },
      { name: "Poro", zone: "main", quantity: 39 },
    ];

    expect(withSingleChampion(lines)).toEqual(lines);
  });
});
