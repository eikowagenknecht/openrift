import { describe, expect, it } from "vitest";

import type { UvsDeepFetchRaw, UvsEventFacts } from "./uvsgames-transform.js";
import {
  completedRounds,
  projectPhases,
  projectRoundMatches,
  readDeckLines,
  referencedDeckIds,
  storedDecks,
  transformUvsEvent,
  unfetchedDeckIds,
} from "./uvsgames-transform.js";

const FACTS: UvsEventFacts = {
  externalId: "4821",
  name: "Summoner Skirmish Regional",
  startAt: new Date("2026-08-16T00:00:00Z"),
  timezone: "America/New_York",
  eventFormat: "CONSTRUCTED",
  playerCount: 3,
  storeName: "The Rift Room",
  location: "12 Nexus Ave, Portland, OR, 97201, US",
  templateTier: "store",
};

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

function raw(overrides: Partial<UvsDeepFetchRaw> = {}): UvsDeepFetchRaw {
  return {
    detail: { name: "Summoner Skirmish Regional" },
    registrations: [registration()],
    standings: [],
    roundStandings: [],
    decks: {},
    ...overrides,
  };
}

describe("transformUvsEvent", () => {
  it("builds the event header from the catalogue facts", () => {
    const { event } = transformUvsEvent(FACTS, raw());

    expect(event).toMatchObject({
      externalId: "4821",
      name: "Summoner Skirmish Regional",
      // 00:00 UTC is still the previous day at the venue.
      eventDate: "2026-08-15",
      format: "constructed",
      playerCount: 3,
      organizer: "The Rift Room",
      sourceUrl: "https://locator.riftbound.uvsgames.com/events/4821",
      notes: null,
      // The mapped template tier, whatever the free-text name says.
      tier: "store",
      country: "US",
      location: "12 Nexus Ave, Portland, OR, 97201, US",
    });
  });

  it("falls back to the player-count placeholder when the template is unmapped", () => {
    const { event } = transformUvsEvent(
      { ...FACTS, templateTier: null, playerCount: 2224 },
      raw({ detail: { name: "Riftbound Regional Qualifier - Portland" } }),
    );
    expect(event.tier).toBe("competitive");
  });

  it("stores null for an address no country can be read from", () => {
    const { event } = transformUvsEvent({ ...FACTS, location: "Somewhere on Runeterra" }, raw());
    expect(event.country).toBeNull();
    expect(event.location).toBe("Somewhere on Runeterra");
  });

  it("keeps an unmapped source format verbatim so the review screen can report it", () => {
    const { event } = transformUvsEvent({ ...FACTS, eventFormat: "SEALED" }, raw());

    expect(event.format).toBe("sealed");
  });

  it("maps a registration's record and placement onto a standings row", () => {
    const { event } = transformUvsEvent(FACTS, raw());

    expect(event.players).toEqual([
      {
        externalId: "900",
        playerName: "Ashwalker",
        rank: 1,
        rankIsTier: false,
        wins: 5,
        losses: 1,
        draws: 0,
        matchPoints: null,
        opponentMatchWinPct: null,
        gameWinPct: null,
        opponentGameWinPct: null,
        entryStatus: null,
        legendName: null,
        championName: null,
        cards: null,
        listStatus: "none",
      },
    ]);
  });

  it("takes the match points and tiebreakers from the round standings", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        roundStandings: [
          {
            match_points: 21,
            opponent_match_win_percentage: 0.65382653,
            game_win_percentage: 0.77777778,
            opponent_game_win_percentage: 0.64397379,
            user_event_status: { id: 900, deck_defining_card: { name: "Jinx" } },
          },
        ],
      }),
    );

    expect(event.players[0]).toMatchObject({
      matchPoints: 21,
      opponentMatchWinPct: 0.65382653,
      gameWinPct: 0.77777778,
      opponentGameWinPct: 0.64397379,
    });
  });

  it("drops a tiebreaker the source reports outside 0..1", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        roundStandings: [
          {
            game_win_percentage: 1.5,
            opponent_game_win_percentage: 0.5,
            user_event_status: { id: 900 },
          },
        ],
      }),
    );

    expect(event.players[0].gameWinPct).toBeNull();
    expect(event.players[0].opponentGameWinPct).toBe(0.5);
  });

  it("lowers the registration status into the archive's vocabulary", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [
          registration({ registration_status: "DROPPED" }),
          registration({ id: 901, best_identifier: "Riverspeaker", final_place_in_standings: 2 }),
          registration({
            id: 902,
            best_identifier: "Zaunite",
            final_place_in_standings: 3,
            registration_status: "SOMETHING_NEW",
          }),
        ],
      }),
    );

    expect(event.players.map((player) => player.entryStatus)).toEqual(["dropped", null, null]);
  });

  it("falls back to the registration's own match points when no standings row exists", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({ registrations: [registration({ total_match_points: 15 })] }),
    );

    expect(event.players[0].matchPoints).toBe(15);
  });

  it("stores no records for a field that tracked no matches", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [
          registration({ matches_won: 0, matches_drawn: 1, matches_lost: 0 }),
          registration({
            id: 901,
            best_identifier: "Riverspeaker",
            matches_won: 0,
            matches_lost: 0,
            matches_drawn: 1,
            final_place_in_standings: 2,
          }),
          registration({
            id: 902,
            best_identifier: "Zaunite",
            matches_won: 0,
            matches_lost: 0,
            matches_drawn: 1,
            final_place_in_standings: 3,
          }),
        ],
      }),
    );

    for (const player of event.players) {
      expect([player.wins, player.losses, player.draws]).toEqual([null, null, null]);
    }
  });

  it("keeps records once any player won or lost a match", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [
          registration({ matches_won: 1, matches_lost: 0, matches_drawn: 0 }),
          registration({
            id: 901,
            best_identifier: "Riverspeaker",
            matches_won: 0,
            matches_lost: 0,
            matches_drawn: 1,
            final_place_in_standings: 2,
          }),
          registration({
            id: 902,
            best_identifier: "Zaunite",
            matches_won: 0,
            matches_lost: 1,
            matches_drawn: 0,
            final_place_in_standings: 3,
          }),
        ],
      }),
    );

    expect(event.players.map((player) => player.draws)).toEqual([0, 1, 0]);
  });

  it("keeps a two-player field's genuinely drawn record", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [
          registration({ matches_won: 0, matches_lost: 0, matches_drawn: 1 }),
          registration({
            id: 901,
            best_identifier: "Riverspeaker",
            matches_won: 0,
            matches_lost: 0,
            matches_drawn: 1,
            final_place_in_standings: 2,
          }),
        ],
      }),
    );

    expect(event.players.map((player) => player.draws)).toEqual([1, 1]);
  });

  it("joins the legend from the last completed round's standings", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        roundStandings: [
          { user_event_status: { id: 900, deck_defining_card: { name: "Jinx" } } },
          { user_event_status: { id: 901, deck_defining_card: { name: "Viktor" } } },
        ],
      }),
    );

    expect(event.players[0].legendName).toBe("Jinx");
  });

  it("drops a registration with no name or no placement, and counts it", () => {
    const { event, dropped } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [
          registration(),
          registration({ id: 901, best_identifier: null }),
          registration({ id: 902, final_place_in_standings: null }),
        ],
      }),
    );

    expect(event.players).toHaveLength(1);
    expect(dropped).toBe(2);
  });

  it("fills a missing placement from the tv standings when the name is unambiguous", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [registration({ final_place_in_standings: null })],
        standings: [{ rank: 4, tv_display_name: "ashwalker" }],
      }),
    );

    expect(event.players[0].rank).toBe(4);
  });

  it("refuses a tv-standings rank when the display name is not unique", () => {
    const { event, dropped } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [registration({ final_place_in_standings: null })],
        standings: [
          { rank: 4, tv_display_name: "Ashwalker" },
          { rank: 9, tv_display_name: "Ashwalker" },
        ],
      }),
    );

    expect(event.players).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it("attaches a published decklist with its zones mapped", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [registration({ deck_id: "deck-1" })],
        decks: {
          "deck-1": {
            sections: [
              { type: "legend", cards: [{ name: "Jinx", quantity: 1 }] },
              { type: "champion", cards: [{ card: { name: "Vi" }, quantity: 1 }] },
              { type: "rune_pool", cards: [{ name: "Fury Rune", count: 12 }] },
              { type: "main", cards: [{ name: "Get Excited", quantity: 3 }] },
              { type: "battlefield", cards: [{ name: "Zaun Alley" }] },
              { type: "sideboard", cards: [{ name: "Riot Police", quantity: 2 }] },
              { type: "mystery_zone", cards: [{ name: "Unknown Thing", quantity: 1 }] },
            ],
          },
        },
      }),
    );

    expect(event.players[0].listStatus).toBe("full");
    expect(event.players[0].championName).toBe("Vi");
    expect(event.players[0].cards).toEqual([
      { name: "Jinx", zone: "legend", quantity: 1 },
      { name: "Vi", zone: "champion", quantity: 1 },
      { name: "Fury Rune", zone: "runes", quantity: 12 },
      { name: "Get Excited", zone: "main", quantity: 3 },
      { name: "Zaun Alley", zone: "battlefield", quantity: 1 },
      { name: "Riot Police", zone: "sideboard", quantity: 2 },
      { name: "Unknown Thing", zone: "main", quantity: 1 },
    ]);
  });

  it("leaves a player standings-only when their deck could not be read", () => {
    const { event, unreadableDecks } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [registration({ deck_id: "deck-1" })],
        decks: { "deck-1": { sections: [] } },
      }),
    );

    expect(event.players[0].cards).toBeNull();
    expect(event.players[0].listStatus).toBe("none");
    expect(unreadableDecks).toBe(1);
  });

  it("does not count a deck the source refused as unreadable", () => {
    const { event, unreadableDecks } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [registration({ deck_id: "deck-1" })],
        decks: { "deck-1": null },
      }),
    );

    expect(event.players[0].cards).toBeNull();
    expect(event.players[0].listStatus).toBe("none");
    expect(unreadableDecks).toBe(0);
  });
});

describe("transformUvsEvent name lengths", () => {
  const LONG = "N".repeat(200);

  it("truncates the standings name, which the ingest would reject rather than trim", () => {
    const { event } = transformUvsEvent(
      FACTS,
      raw({ registrations: [registration({ best_identifier: LONG })] }),
    );

    expect(event.players[0].playerName).toHaveLength(80);
  });

  it("leaves the identity name whole, since the player upsert is what bounds it", () => {
    const { players } = transformUvsEvent(
      FACTS,
      raw({ registrations: [registration({ best_identifier: LONG, user: { id: 41 } })] }),
    );

    expect(players[0].displayName).toBe(LONG);
  });
});

describe("transformUvsEvent player identities", () => {
  it("names the source's user behind each registration, keyed by the staged row's id", () => {
    const { players } = transformUvsEvent(
      FACTS,
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
    const { players } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [registration({ best_identifier: "Ashwalker", user: { id: 41 } })],
        standings: [{ tv_display_name: "Real Name", rank: 1 }],
      }),
    );

    expect(players).toEqual([{ registrationId: "900", userId: 41, displayName: "Ashwalker" }]);
  });

  it("still stages the standings row for a registration the source gives no usable user id", () => {
    for (const user of [undefined, {}, { id: 0 }, { id: -1 }, { id: 4.5 }, { id: "41" }]) {
      const { event, players } = transformUvsEvent(
        FACTS,
        raw({ registrations: [registration({ user })] }),
      );

      expect(players).toEqual([]);
      expect(event.players).toHaveLength(1);
    }
  });

  it("has no identity for a registration that was dropped for want of a placement", () => {
    const { event, players } = transformUvsEvent(
      FACTS,
      raw({
        registrations: [registration({ final_place_in_standings: null, user: { id: 41 } })],
      }),
    );

    expect(players).toEqual([]);
    expect(event.players).toEqual([]);
  });
});

describe("storedDecks", () => {
  it("hands back the stored map, refusal markers included", () => {
    expect(storedDecks({ decks: { held: { sections: [] }, refused: null } })).toEqual({
      held: { sections: [] },
      refused: null,
    });
  });

  it("is empty for anything that is not a plain object", () => {
    expect(storedDecks(null)).toEqual({});
    expect(storedDecks(undefined)).toEqual({});
    expect(storedDecks({})).toEqual({});
    expect(storedDecks({ decks: [] })).toEqual({});
    expect(storedDecks({ decks: "junk" })).toEqual({});
    expect(storedDecks({ decks: null })).toEqual({});
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

    expect(phases[0].maxGameWins).toBe(1);
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

describe("unfetchedDeckIds", () => {
  it("returns the referenced ids with no stored entry, counting refusals as held", () => {
    const ids = unfetchedDeckIds({
      registrations: [{ deck_id: "held" }, { deck_id: "refused" }, { deck_id: "open" }, {}],
      decks: { held: { sections: [] }, refused: null },
    });

    expect(ids).toEqual(["open"]);
  });

  it("is empty for a candidate that has never been fetched", () => {
    expect(unfetchedDeckIds(null)).toEqual([]);
    expect(unfetchedDeckIds(undefined)).toEqual([]);
    expect(unfetchedDeckIds({ registrations: "junk", decks: "junk" })).toEqual([]);
  });
});

describe("readDeckLines", () => {
  it("returns null for a deck with no readable card line", () => {
    expect(readDeckLines(null)).toBeNull();
    expect(readDeckLines({ sections: [{ type: "main", cards: [{ quantity: 2 }] }] })).toBeNull();
  });

  it("defaults a missing quantity to one copy", () => {
    const lines = readDeckLines({ sections: [{ type: "main", cards: [{ name: "Poro" }] }] });

    expect(lines?.cards).toEqual([{ name: "Poro", zone: "main", quantity: 1 }]);
  });
});
