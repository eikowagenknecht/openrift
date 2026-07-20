// Pure presentation helpers for the unified tournaments umbrella (ADR-033).
// Kept free of React so they can be unit-tested in isolation and reused across
// the list, detail, and wizard surfaces.

import type {
  EffectiveTournamentState,
  TournamentDeckPhase,
  TournamentDeckSubmission,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentParticipantResponse,
  TournamentParticipantStatus,
  TournamentStaffRole,
  TournamentSummaryResponse,
  TournamentViewerRole,
} from "@openrift/shared";
import { effectiveTournamentState } from "@openrift/shared";

export const DECK_SUBMISSION_LABEL: Record<TournamentDeckSubmission, string> = {
  none: "No decklist",
  optional: "Decklist optional",
  required: "Decklist required",
};

export const DECK_PHASE_LABEL: Record<TournamentDeckPhase, string> = {
  open: "Open for submissions",
  closed: "Closed",
  locked: "Locked",
};

// Short form for inline prose ("Pod rounds. The engine is fixed once…").
export const PAIRING_STYLE_LABEL: Record<TournamentPairingStyle, string> = {
  pod: "Pod rounds",
  swiss: "Swiss rounds",
  none: "None",
};

// Select option lists shared by the create wizard and the settings tab, so the
// two surfaces can't drift apart. The pairing labels carry the longer guidance
// shown inside the dropdown; PAIRING_STYLE_LABEL is the short inline form.
export const PAIRING_STYLE_ITEMS: { value: TournamentPairingStyle; label: string }[] = [
  { value: "none", label: "None (I'm not running rounds here)" },
  { value: "pod", label: "Pod rounds (3 or 4-player free-for-alls)" },
  { value: "swiss", label: "Swiss rounds (1v1 matches)" },
];

export const MATCH_FORMAT_LABEL: Record<TournamentMatchFormat, string> = {
  bo1: "Best of 1",
  bo3: "Best of 3",
};

export const MATCH_FORMAT_ITEMS: { value: TournamentMatchFormat; label: string }[] = [
  { value: "bo1", label: MATCH_FORMAT_LABEL.bo1 },
  { value: "bo3", label: MATCH_FORMAT_LABEL.bo3 },
];

/**
 * Whether a pairing style runs rounds at all (pods or Swiss). The single gate
 * for the pairings/standings surfaces, so pod-only checks can't linger.
 *
 * @param style The tournament's pairing style.
 * @returns True for pod and swiss, false for none.
 */
export function hasPairing(style: TournamentPairingStyle): boolean {
  return style !== "none";
}

/**
 * Whether a pairing of this size is a 1v1 match rather than a multiplayer pod.
 *
 * Keyed on the pairing's own size, not on the tournament's pairing style: the
 * pod engine seats a 2-player pod when the field forces one, and that pairing is
 * a match no matter which engine drew it. "Pod" is the engine's word for the
 * row; a 1v1 is only ever a match to the people playing it.
 *
 * The pod engine seats a 2-player pod whenever the field forces one, so a
 * pairing is a match by its seat count, never by the tournament's pairing
 * style. Callers key their 1v1 affordances (the Swiss result form, the swords
 * icon) off this, so the rule has one home.
 *
 * @param size The pairing's seat count.
 * @returns True for a 1v1.
 */
export function isMatchPairing(size: number): boolean {
  return size === 2;
}

/**
 * One pairing's display name.
 *
 * @param size The pairing's seat count.
 * @param podNumber The pairing's 1-based number within its round.
 * @returns `Match 3` for a 1v1, `Pod 3` otherwise.
 */
export function pairingLabel(size: number, podNumber: number): string {
  return `${isMatchPairing(size) ? "Match" : "Pod"} ${podNumber}`;
}

/**
 * A placement with its ordinal suffix. Pods seat at most four, but this is
 * general: the 11th-13th exception is handled so a caller outside a pod can't
 * be handed "11st".
 *
 * @param place The 1-based placement.
 * @returns `1st`, `2nd`, `3rd`, `4th`, `11th`, …
 */
export function ordinalPlace(place: number): string {
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) {
    return `${place}th`;
  }
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[place % 10] ?? "th";
  return `${place}${suffix}`;
}

/**
 * Whether a round is 1v1s throughout — the round-level shape of
 * {@link isMatchPairing}, for surfaces that describe or count a whole round.
 * A mixed round is not an all-match round: the broader treatment is the honest
 * one, since match wording would misname the larger pods in it. An empty round
 * has no shape to report and is never all-match.
 *
 * @param sizes The seat count of every pairing in the round.
 * @returns True when every pairing is a 1v1.
 */
export function isAllMatchRound(sizes: readonly number[]): boolean {
  return sizes.length > 0 && sizes.every((size) => isMatchPairing(size));
}

/**
 * The plural noun for a round's pairings, for prose that counts them
 * ("2 of 3 matches reported").
 *
 * @param sizes The seat count of every pairing in the round.
 * @returns `matches` when every pairing is a 1v1, `pods` otherwise.
 */
export function pairingPluralNoun(sizes: readonly number[]): string {
  return isAllMatchRound(sizes) ? "matches" : "pods";
}

export const DECK_SUBMISSION_ITEMS: { value: TournamentDeckSubmission; label: string }[] = [
  { value: "none", label: DECK_SUBMISSION_LABEL.none },
  { value: "optional", label: DECK_SUBMISSION_LABEL.optional },
  { value: "required", label: DECK_SUBMISSION_LABEL.required },
];

export const PARTICIPANT_STATUS_LABEL: Record<TournamentParticipantStatus, string> = {
  requested: "Requested",
  invited: "Invited",
  active: "Active",
  dropped: "Dropped",
  no_show: "No show",
};

export const STAFF_ROLE_LABEL: Record<TournamentStaffRole, string> = {
  organizer: "Organizer",
  judge: "Judge",
};

export const VIEWER_ROLE_LABEL: Record<TournamentViewerRole, string> = {
  host: "Host",
  organizer: "Organizer",
  judge: "Judge",
  participant: "Participant",
};

// True when the viewer can edit the tournament (the host or an organizer).
export function canManageTournament(myRoles: readonly TournamentViewerRole[]): boolean {
  return myRoles.includes("host") || myRoles.includes("organizer");
}

// True when the viewer is the host (owns staff / settings / danger zone).
export function isTournamentHost(myRoles: readonly TournamentViewerRole[]): boolean {
  return myRoles.includes("host");
}

// True when the viewer judges this tournament (host / organizer / judge).
export function canCheckDecks(myRoles: readonly TournamentViewerRole[]): boolean {
  return myRoles.includes("host") || myRoles.includes("organizer") || myRoles.includes("judge");
}

// True when the viewer works the event (host / organizer / judge) — the set
// the staff-gated API surfaces (the participant roster with its claim links)
// accept. Fetching those as a plain participant 403s, so gate on this first.
export function isTournamentStaff(myRoles: readonly TournamentViewerRole[]): boolean {
  return myRoles.includes("host") || myRoles.includes("organizer") || myRoles.includes("judge");
}

// Combine a local-time date (YYYY-MM-DD) + time (HH:mm) the HOST typed into a
// UTC ISO instant for storage. Interprets the inputs in the runtime's local
// timezone. Returns null if either part is malformed.
export function combineLocalDateTimeToUtc(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return null;
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) {
    return null;
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

// Split a stored UTC ISO instant back into local-timezone date + time strings
// for editing in the wizard / settings inputs (round-trips with the combine fn).
export function splitUtcToLocalDateTime(iso: string): { date: string; time: string } {
  const dt = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
  };
}

export interface ParsedScheduleInput {
  // The start as a UTC instant, or null when the date/time pair is incomplete.
  startsAt: string | null;
  // The end as a UTC instant, or null for a single-day event (both parts blank).
  endsAt: string | null;
  // The start was touched but isn't a valid date+time (for an inline message
  // that stays hidden on an untouched field).
  startInvalid: boolean;
  // Exactly one end part is filled, or both are malformed.
  endIncomplete: boolean;
  // A complete end that falls before the start.
  endBeforeStart: boolean;
  // Any of the above — the gate for disabling create/save.
  scheduleInvalid: boolean;
}

// Parse the host's local start/end date+time inputs into UTC instants plus the
// validation flags the create wizard and settings tab both need. The end is
// optional: both parts blank means a single-day event (null end); filling only
// one part is an `endIncomplete` error. Shared so the two surfaces stay in step.
export function parseScheduleInput(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): ParsedScheduleInput {
  const startsAt = combineLocalDateTimeToUtc(startDate, startTime);
  const startTouched = startDate !== "" || startTime !== "";
  const endTouched = endDate !== "" || endTime !== "";
  const endsAt = endTouched ? combineLocalDateTimeToUtc(endDate, endTime) : null;
  const endIncomplete = endTouched && endsAt === null;
  const endBeforeStart = endsAt !== null && startsAt !== null && endsAt < startsAt;
  return {
    startsAt,
    endsAt,
    startInvalid: startTouched && startsAt === null,
    endIncomplete,
    endBeforeStart,
    scheduleInvalid: startsAt === null || endIncomplete || endBeforeStart,
  };
}

// Human-readable display of a stored instant in the VIEWER's local timezone,
// 24-hour. Never the technical UTC `…Z` form, never US M/D/Y.
export function formatTournamentDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  });
}

// The IANA timezone the runtime is in (for an input hint like "Europe/Berlin").
export function localTimeZoneLabel(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * The event's hosting-context label for list rows and hero badges: its group,
 * or its org host. Null for a plain user-hosted event with no group, where
 * naming the host adds nothing.
 *
 * @returns The context label, or null.
 */
export function tournamentContextLabel(
  tournament: Pick<TournamentSummaryResponse, "groupName" | "host">,
): string | null {
  if (tournament.groupName) {
    return tournament.groupName;
  }
  return tournament.host.type === "organization" ? tournament.host.displayName : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A short countdown to a stored instant, by local calendar day: "today",
 * "tomorrow", or "in N days". `null` once the instant has passed (the caller
 * shows a live/completed state instead). `now` is injectable for tests.
 *
 * @returns The countdown label, or null when `iso` is in the past.
 */
export function formatStartsIn(iso: string, now: Date = new Date()): string | null {
  const start = new Date(iso);
  if (start.getTime() <= now.getTime()) {
    return null;
  }
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(start) - startOfDay(now)) / DAY_MS);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "tomorrow";
  }
  return `in ${days} days`;
}

// ─── Lifecycle (ADR-033) ─────────────────────────────────────────────────────

// The state derivation lives in shared so the API's summary extras (winner
// resolution) use the same completion rule as these lists.
export { effectiveTournamentState } from "@openrift/shared";
export type { EffectiveTournamentState } from "@openrift/shared";

export const EFFECTIVE_STATE_LABEL: Record<EffectiveTournamentState, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const EFFECTIVE_STATE_ORDER: Record<EffectiveTournamentState, number> = {
  in_progress: 0,
  upcoming: 1,
  completed: 2,
  cancelled: 3,
};

// List ordering: live/upcoming on top, finished sunk. Upcoming soonest-first;
// finished most-recent-first.
export function compareTournamentsForList(
  a: TournamentSummaryResponse,
  b: TournamentSummaryResponse,
  now: Date = new Date(),
): number {
  const stateA = effectiveTournamentState(a.startsAt, a.endsAt, a.status, now);
  const stateB = effectiveTournamentState(b.startsAt, b.endsAt, b.status, now);
  const byState = EFFECTIVE_STATE_ORDER[stateA] - EFFECTIVE_STATE_ORDER[stateB];
  if (byState !== 0) {
    return byState;
  }
  // Upcoming / in-progress sort soonest-first; finished sort most-recent-first.
  const finished = stateA === "completed" || stateA === "cancelled";
  return finished ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt);
}

// Splits tournaments into current (upcoming + in_progress) and past (completed +
// cancelled) by effective state, preserving the input order within each group.
export function partitionTournaments(
  tournaments: readonly TournamentSummaryResponse[],
  now: Date = new Date(),
): {
  current: TournamentSummaryResponse[];
  pastOrArchived: TournamentSummaryResponse[];
} {
  const current: TournamentSummaryResponse[] = [];
  const pastOrArchived: TournamentSummaryResponse[] = [];
  for (const tournament of tournaments) {
    const state = effectiveTournamentState(
      tournament.startsAt,
      tournament.endsAt,
      tournament.status,
      now,
    );
    if (state === "completed" || state === "cancelled") {
      pastOrArchived.push(tournament);
    } else {
      current.push(tournament);
    }
  }
  return { current, pastOrArchived };
}

// Roster ordering: things needing attention first (join requests, then pending
// invites), then the active field, with dropped and no-shows sunk to the bottom.
// Mirrors the old deck-check entrant list's "actionable first" intent.
const PARTICIPANT_STATUS_ORDER: Record<TournamentParticipantStatus, number> = {
  requested: 0,
  invited: 1,
  active: 2,
  dropped: 3,
  no_show: 4,
};

// Comparator for the participants roster: by status priority, then display name.
export function compareParticipantsForList(
  a: TournamentParticipantResponse,
  b: TournamentParticipantResponse,
): number {
  return (
    PARTICIPANT_STATUS_ORDER[a.status] - PARTICIPANT_STATUS_ORDER[b.status] ||
    a.displayName.localeCompare(b.displayName)
  );
}

// Highest-priority viewer role label for a list-row chip, or null.
export function primaryViewerRole(
  myRoles: readonly TournamentViewerRole[],
): TournamentViewerRole | null {
  const order: TournamentViewerRole[] = ["host", "organizer", "judge", "participant"];
  for (const role of order) {
    if (myRoles.includes(role)) {
      return role;
    }
  }
  return null;
}
