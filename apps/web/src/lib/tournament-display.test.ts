import type {
  TournamentParticipantResponse,
  TournamentParticipantStatus,
  TournamentStatus,
  TournamentSummaryResponse,
  TournamentViewerRole,
} from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  canCheckDecks,
  canManageTournament,
  hasPairing,
  MATCH_FORMAT_ITEMS,
  ordinalPlace,
  PAIRING_STYLE_ITEMS,
  pairingLabel,
  pairingPluralNoun,
  combineLocalDateTimeToUtc,
  compareParticipantsForList,
  compareTournamentsForList,
  effectiveTournamentState,
  formatStartsIn,
  formatTournamentDate,
  isTournamentHost,
  parseScheduleInput,
  partitionTournaments,
  primaryViewerRole,
  splitUtcToLocalDateTime,
  tournamentContextLabel,
} from "./tournament-display";

function makeParticipant(
  status: TournamentParticipantStatus,
  displayName: string,
): TournamentParticipantResponse {
  return {
    id: `${status}-${displayName}`,
    userId: null,
    userName: null,
    displayName,
    riotId: null,
    status,
    seed: null,
    region: null,
    fixedTable: null,
    droppedAfterRound: null,
    claimToken: null,
    claimBlocked: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeTournament(
  status: TournamentStatus,
  overrides: Partial<TournamentSummaryResponse> = {},
): TournamentSummaryResponse {
  return {
    id: status,
    name: `Tournament (${status})`,
    status,
    host: { type: "user", userId: "u1", orgId: null, displayName: "Host", orgSlug: null },
    groupId: null,
    groupSlug: null,
    groupName: null,
    pairingStyle: "pod",
    deckSubmission: "none",
    deckFormat: null,
    startsAt: "2026-06-28T18:00:00Z",
    endsAt: null,
    modules: { pairing: true, deckSubmission: false },
    participantCount: 0,
    pendingRequestCount: 0,
    myRoles: [],
    participantPreview: [],
    winner: null,
    coverLegends: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("canManageTournament", () => {
  it("is true for host or organizer", () => {
    expect(canManageTournament(["host"])).toBe(true);
    expect(canManageTournament(["organizer"])).toBe(true);
    expect(canManageTournament(["organizer", "participant"])).toBe(true);
  });

  it("is false for judge, participant, or empty", () => {
    expect(canManageTournament(["judge"])).toBe(false);
    expect(canManageTournament(["participant"])).toBe(false);
    expect(canManageTournament([])).toBe(false);
  });
});

describe("isTournamentHost", () => {
  it("only matches the host role", () => {
    expect(isTournamentHost(["host"])).toBe(true);
    expect(isTournamentHost(["organizer"])).toBe(false);
    expect(isTournamentHost([])).toBe(false);
  });
});

describe("canCheckDecks", () => {
  it("includes judges", () => {
    expect(canCheckDecks(["judge"])).toBe(true);
    expect(canCheckDecks(["host"])).toBe(true);
    expect(canCheckDecks(["organizer"])).toBe(true);
  });

  it("excludes participant", () => {
    expect(canCheckDecks(["participant"])).toBe(false);
  });
});

describe("combineLocalDateTimeToUtc", () => {
  it("round-trips with splitUtcToLocalDateTime in the runtime's timezone", () => {
    // We must not pin a UTC string here: the combine fn interprets the inputs in
    // the test runner's local timezone, so the only stable assertion is that
    // splitting the result back returns the same local date + time.
    const iso = combineLocalDateTimeToUtc("2026-06-14", "20:30");
    expect(iso).not.toBeNull();
    expect(splitUtcToLocalDateTime(iso as string)).toEqual({ date: "2026-06-14", time: "20:30" });
  });

  it("round-trips boundary times", () => {
    for (const [date, time] of [
      ["2026-01-01", "00:00"],
      ["2026-12-31", "23:59"],
    ] as const) {
      const iso = combineLocalDateTimeToUtc(date, time);
      expect(iso).not.toBeNull();
      expect(splitUtcToLocalDateTime(iso as string)).toEqual({ date, time });
    }
  });

  it("rejects malformed dates", () => {
    expect(combineLocalDateTimeToUtc("2026-6-28", "18:30")).toBeNull();
    expect(combineLocalDateTimeToUtc("not-a-date", "18:30")).toBeNull();
    expect(combineLocalDateTimeToUtc("", "18:30")).toBeNull();
  });

  it("rejects malformed or out-of-range times", () => {
    expect(combineLocalDateTimeToUtc("2026-06-28", "24:00")).toBeNull();
    expect(combineLocalDateTimeToUtc("2026-06-28", "18:60")).toBeNull();
    expect(combineLocalDateTimeToUtc("2026-06-28", "6:30")).toBeNull();
    expect(combineLocalDateTimeToUtc("2026-06-28", "")).toBeNull();
  });
});

describe("parseScheduleInput", () => {
  it("parses a single-day event (valid start, blank end)", () => {
    const result = parseScheduleInput("2026-06-14", "20:30", "", "");
    expect(result.startsAt).not.toBeNull();
    expect(result.endsAt).toBeNull();
    expect(result.startInvalid).toBe(false);
    expect(result.endIncomplete).toBe(false);
    expect(result.endBeforeStart).toBe(false);
    expect(result.scheduleInvalid).toBe(false);
  });

  it("parses a multi-day event with a valid end after the start", () => {
    const result = parseScheduleInput("2026-06-14", "20:30", "2026-06-15", "18:00");
    expect(result.startsAt).not.toBeNull();
    expect(result.endsAt).not.toBeNull();
    expect(result.scheduleInvalid).toBe(false);
  });

  it("flags startInvalid only once a start part is touched", () => {
    // Both blank: an untouched form shows no error but still can't be saved.
    const untouched = parseScheduleInput("", "", "", "");
    expect(untouched.startInvalid).toBe(false);
    expect(untouched.scheduleInvalid).toBe(true);

    // A date with no time is a touched-but-invalid start.
    const touched = parseScheduleInput("2026-06-14", "", "", "");
    expect(touched.startsAt).toBeNull();
    expect(touched.startInvalid).toBe(true);
    expect(touched.scheduleInvalid).toBe(true);
  });

  it("flags an incomplete end (only one part filled)", () => {
    const result = parseScheduleInput("2026-06-14", "20:30", "2026-06-15", "");
    expect(result.endsAt).toBeNull();
    expect(result.endIncomplete).toBe(true);
    expect(result.scheduleInvalid).toBe(true);
  });

  it("flags an end that falls before the start", () => {
    const result = parseScheduleInput("2026-06-14", "20:30", "2026-06-14", "18:00");
    expect(result.endBeforeStart).toBe(true);
    expect(result.scheduleInvalid).toBe(true);
  });

  it("allows an end equal to the start", () => {
    const result = parseScheduleInput("2026-06-14", "20:30", "2026-06-14", "20:30");
    expect(result.endBeforeStart).toBe(false);
    expect(result.scheduleInvalid).toBe(false);
  });
});

describe("formatTournamentDate", () => {
  it("renders a non-empty human-readable string without the technical UTC Z form", () => {
    const out = formatTournamentDate("2026-06-14T18:30:00Z");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain("Z");
    expect(out).not.toMatch(/T\d{2}:\d{2}.*Z/u);
  });
});

describe("tournamentContextLabel", () => {
  it("prefers the group name", () => {
    const tournament = makeTournament("setup", {
      groupName: "Allerlei Spielerei",
      host: { type: "organization", userId: null, orgId: "o1", displayName: "LGS", orgSlug: "lgs" },
    });
    expect(tournamentContextLabel(tournament)).toBe("Allerlei Spielerei");
  });

  it("falls back to an organization host's display name", () => {
    const tournament = makeTournament("setup", {
      host: { type: "organization", userId: null, orgId: "o1", displayName: "LGS", orgSlug: "lgs" },
    });
    expect(tournamentContextLabel(tournament)).toBe("LGS");
  });

  it("is null for a plain user-hosted event with no group", () => {
    expect(tournamentContextLabel(makeTournament("setup"))).toBeNull();
  });
});

describe("formatStartsIn", () => {
  const now = new Date("2026-07-16T10:00:00");

  it("is null once the instant has passed", () => {
    expect(formatStartsIn("2026-07-16T09:00:00", now)).toBeNull();
    expect(formatStartsIn(now.toISOString(), now)).toBeNull();
  });

  it("labels the same local day as today", () => {
    expect(formatStartsIn("2026-07-16T20:00:00", now)).toBe("today");
  });

  it("labels the next local day as tomorrow, even when under 24h away", () => {
    expect(formatStartsIn("2026-07-17T08:00:00", now)).toBe("tomorrow");
  });

  it("counts calendar days after that", () => {
    expect(formatStartsIn("2026-07-18T09:00:00", now)).toBe("in 2 days");
    expect(formatStartsIn("2026-08-08T13:00:00", now)).toBe("in 23 days");
  });
});

describe("primaryViewerRole", () => {
  it("returns the highest-priority role", () => {
    const roles: TournamentViewerRole[] = ["participant", "judge", "host"];
    expect(primaryViewerRole(roles)).toBe("host");
    expect(primaryViewerRole(["participant", "judge"])).toBe("judge");
    expect(primaryViewerRole(["participant"])).toBe("participant");
  });

  it("returns null when there are no roles", () => {
    expect(primaryViewerRole([])).toBeNull();
  });
});

describe("effectiveTournamentState", () => {
  // A fixed "now" so every case is deterministic regardless of the runner clock.
  const now = new Date("2026-06-28T12:00:00Z");

  it("treats an explicit cancelled status as cancelled, regardless of dates", () => {
    expect(effectiveTournamentState("2026-06-01T10:00:00Z", null, "cancelled", now)).toBe(
      "cancelled",
    );
    // Future start, still cancelled.
    expect(effectiveTournamentState("2026-07-01T10:00:00Z", null, "cancelled", now)).toBe(
      "cancelled",
    );
  });

  it("treats an explicit completed status as completed (e.g. ended early)", () => {
    expect(effectiveTournamentState("2026-07-01T10:00:00Z", null, "completed", now)).toBe(
      "completed",
    );
  });

  it("is upcoming before the start", () => {
    expect(effectiveTournamentState("2026-06-28T18:00:00Z", null, "setup", now)).toBe("upcoming");
  });

  it("is in_progress between the start and the end", () => {
    expect(
      effectiveTournamentState("2026-06-28T10:00:00Z", "2026-06-28T20:00:00Z", "running", now),
    ).toBe("in_progress");
  });

  it("auto-completes once now is past the end date", () => {
    expect(
      effectiveTournamentState("2026-06-27T10:00:00Z", "2026-06-28T11:00:00Z", "running", now),
    ).toBe("completed");
  });

  it("auto-completes 24h after the start when there is no end", () => {
    // Started 25h ago, no end → past the start+24h grace → completed.
    expect(effectiveTournamentState("2026-06-27T11:00:00Z", null, "running", now)).toBe(
      "completed",
    );
    // Started 11h ago, no end → still inside the grace → in_progress.
    expect(effectiveTournamentState("2026-06-28T01:00:00Z", null, "running", now)).toBe(
      "in_progress",
    );
  });

  it("keeps a 23:00 start in_progress at the next midnight and completed ~24h later", () => {
    const start = "2026-06-27T23:00:00Z";
    // Next midnight (1h after start) → still in_progress, not completed at midnight.
    expect(effectiveTournamentState(start, null, "running", new Date("2026-06-28T00:00:00Z"))).toBe(
      "in_progress",
    );
    // Just before start+24h → still in_progress.
    expect(effectiveTournamentState(start, null, "running", new Date("2026-06-28T22:59:00Z"))).toBe(
      "in_progress",
    );
    // At start+24h → completed.
    expect(effectiveTournamentState(start, null, "running", new Date("2026-06-28T23:00:00Z"))).toBe(
      "completed",
    );
  });

  it("completes immediately when ends_at is set to a past instant (end early)", () => {
    expect(
      effectiveTournamentState("2026-06-28T08:00:00Z", "2026-06-28T11:00:00Z", "running", now),
    ).toBe("completed");
  });
});

describe("compareTournamentsForList", () => {
  const now = new Date("2026-06-28T12:00:00Z");

  it("orders in_progress, then upcoming, then completed/cancelled", () => {
    const inProgress = makeTournament("running", {
      id: "live",
      startsAt: "2026-06-28T10:00:00Z",
      endsAt: "2026-06-28T20:00:00Z",
    });
    const upcoming = makeTournament("setup", { id: "up", startsAt: "2026-06-29T10:00:00Z" });
    const completed = makeTournament("completed", { id: "done", startsAt: "2026-06-20T10:00:00Z" });
    const cancelled = makeTournament("cancelled", { id: "cx", startsAt: "2026-06-21T10:00:00Z" });
    const sorted = [completed, cancelled, upcoming, inProgress].toSorted((a, b) =>
      compareTournamentsForList(a, b, now),
    );
    expect(sorted.map((t) => t.id)).toEqual(["live", "up", "done", "cx"]);
  });

  it("sorts upcoming soonest-first and finished most-recent-first", () => {
    const soon = makeTournament("setup", { id: "soon", startsAt: "2026-06-29T10:00:00Z" });
    const later = makeTournament("setup", { id: "later", startsAt: "2026-07-05T10:00:00Z" });
    const recent = makeTournament("completed", { id: "recent", startsAt: "2026-06-25T10:00:00Z" });
    const older = makeTournament("completed", { id: "older", startsAt: "2026-06-10T10:00:00Z" });
    const sorted = [later, older, recent, soon].toSorted((a, b) =>
      compareTournamentsForList(a, b, now),
    );
    expect(sorted.map((t) => t.id)).toEqual(["soon", "later", "recent", "older"]);
  });
});

describe("partitionTournaments", () => {
  const now = new Date("2026-06-28T12:00:00Z");

  it("splits current (upcoming + in_progress) from past (completed + cancelled)", () => {
    const upcoming = makeTournament("setup", { id: "a", startsAt: "2026-06-29T10:00:00Z" });
    const completed = makeTournament("completed", { id: "b", startsAt: "2026-06-20T10:00:00Z" });
    const inProgress = makeTournament("running", {
      id: "c",
      startsAt: "2026-06-28T10:00:00Z",
      endsAt: "2026-06-28T20:00:00Z",
    });
    const cancelled = makeTournament("cancelled", { id: "d" });
    const { current, pastOrArchived } = partitionTournaments(
      [upcoming, completed, inProgress, cancelled],
      now,
    );
    expect(current.map((t) => t.id)).toEqual(["a", "c"]);
    expect(pastOrArchived.map((t) => t.id)).toEqual(["b", "d"]);
  });

  it("treats an auto-completed (start+24h, no end) tournament as past", () => {
    const stale = makeTournament("running", { id: "stale", startsAt: "2026-06-27T10:00:00Z" });
    const { current, pastOrArchived } = partitionTournaments([stale], now);
    expect(current).toHaveLength(0);
    expect(pastOrArchived.map((t) => t.id)).toEqual(["stale"]);
  });

  it("returns empty groups for an empty input", () => {
    expect(partitionTournaments([], now)).toEqual({ current: [], pastOrArchived: [] });
  });
});

describe("compareParticipantsForList", () => {
  it("orders by status priority: requested → invited → active → dropped → no_show", () => {
    const roster = [
      makeParticipant("no_show", "Ann"),
      makeParticipant("active", "Bob"),
      makeParticipant("requested", "Cleo"),
      makeParticipant("dropped", "Dan"),
      makeParticipant("invited", "Eve"),
    ];
    const sorted = roster.toSorted(compareParticipantsForList);
    expect(sorted.map((p) => p.status)).toEqual([
      "requested",
      "invited",
      "active",
      "dropped",
      "no_show",
    ]);
  });

  it("breaks ties within a status by display name", () => {
    const roster = [
      makeParticipant("active", "Zoe"),
      makeParticipant("active", "Amy"),
      makeParticipant("active", "Mona"),
    ];
    const sorted = roster.toSorted(compareParticipantsForList);
    expect(sorted.map((p) => p.displayName)).toEqual(["Amy", "Mona", "Zoe"]);
  });
});

describe("hasPairing", () => {
  it("is true for the round-running styles and false for none", () => {
    expect(hasPairing("pod")).toBe(true);
    expect(hasPairing("swiss")).toBe(true);
    expect(hasPairing("none")).toBe(false);
  });
});

describe("pairingLabel", () => {
  it("names a 1v1 a match and anything larger a pod", () => {
    expect(pairingLabel(2, 3)).toBe("Match 3");
    expect(pairingLabel(3, 3)).toBe("Pod 3");
    expect(pairingLabel(4, 1)).toBe("Pod 1");
  });
});

describe("ordinalPlace", () => {
  it("suffixes the placements a pod can produce", () => {
    expect([1, 2, 3, 4].map((place) => ordinalPlace(place))).toEqual(["1st", "2nd", "3rd", "4th"]);
  });

  it("keeps the teens honest for callers outside a pod", () => {
    expect(ordinalPlace(11)).toBe("11th");
    expect(ordinalPlace(12)).toBe("12th");
    expect(ordinalPlace(13)).toBe("13th");
    expect(ordinalPlace(21)).toBe("21st");
    expect(ordinalPlace(22)).toBe("22nd");
    expect(ordinalPlace(23)).toBe("23rd");
    expect(ordinalPlace(111)).toBe("111th");
  });
});

describe("pairingPluralNoun", () => {
  it("counts an all-1v1 round as matches", () => {
    expect(pairingPluralNoun([2, 2, 2])).toBe("matches");
  });

  it("counts multiplayer pods as pods", () => {
    expect(pairingPluralNoun([4, 4, 3])).toBe("pods");
  });

  it("falls back to the broader word for a mixed round", () => {
    expect(pairingPluralNoun([2, 4])).toBe("pods");
  });

  it("uses the broader word for a round with no pairings", () => {
    expect(pairingPluralNoun([])).toBe("pods");
  });
});

describe("pairing and match-format option lists", () => {
  it("offers all three pairing styles", () => {
    expect(PAIRING_STYLE_ITEMS.map((item) => item.value)).toEqual(["none", "pod", "swiss"]);
  });

  it("offers both match formats", () => {
    expect(MATCH_FORMAT_ITEMS.map((item) => item.value)).toEqual(["bo1", "bo3"]);
  });
});
