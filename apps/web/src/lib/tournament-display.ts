import type {
  EffectiveTournamentState,
  TournamentDeckPhase,
  TournamentDeckSubmission,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentParticipantResponse,
  TournamentParticipantStatus,
  TournamentPlayMode,
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

export const PAIRING_STYLE_LABEL: Record<TournamentPairingStyle, string> = {
  pod: "Pod rounds",
  swiss: "Swiss rounds",
  none: "None",
};

export const PLAY_MODE_ITEMS: { value: TournamentPlayMode; label: string }[] = [
  { value: "1v1", label: "1v1" },
  { value: "2v2", label: "2v2" },
];

export const MATCH_FORMAT_LABEL: Record<TournamentMatchFormat, string> = {
  bo1: "Best of 1",
  bo3: "Best of 3",
};

// "None" is deliberately not an option: the pairings-enable switch owns that state.
export type TournamentRoundsChoice = "swiss-bo1" | "swiss-bo3" | "pod";

export const ROUNDS_CHOICE_ITEMS: { value: TournamentRoundsChoice; label: string }[] = [
  { value: "swiss-bo1", label: "Swiss - BO1" },
  { value: "swiss-bo3", label: "Swiss - BO3" },
  { value: "pod", label: "FFA" },
];

export function roundsChoiceFor(
  pairingStyle: TournamentPairingStyle,
  matchFormat: TournamentMatchFormat,
): TournamentRoundsChoice | null {
  if (pairingStyle === "none") {
    return null;
  }
  if (pairingStyle === "pod") {
    return "pod";
  }
  return matchFormat === "bo3" ? "swiss-bo3" : "swiss-bo1";
}

export function pairingFromRoundsChoice(choice: TournamentRoundsChoice): {
  pairingStyle: TournamentPairingStyle;
  matchFormat: TournamentMatchFormat;
} {
  if (choice === "pod") {
    return { pairingStyle: "pod", matchFormat: "bo1" };
  }
  return { pairingStyle: "swiss", matchFormat: choice === "swiss-bo3" ? "bo3" : "bo1" };
}

export function hasPairing(style: TournamentPairingStyle): boolean {
  return style !== "none";
}

// Keyed on the pairing's own seat count, not the tournament's pairing style:
// the pod engine seats a 2-player pod when the field forces one, and that
// pairing is a match no matter which engine drew it.
export function isMatchPairing(size: number): boolean {
  return size === 2;
}

export function pairingLabel(size: number, podNumber: number): string {
  return `${isMatchPairing(size) ? "Match" : "Pod"} ${podNumber}`;
}

export function ordinalPlace(place: number): string {
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) {
    return `${place}th`;
  }
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[place % 10] ?? "th";
  return `${place}${suffix}`;
}

export function isAllMatchRound(sizes: readonly number[]): boolean {
  return sizes.length > 0 && sizes.every((size) => isMatchPairing(size));
}

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

export function canManageTournament(myRoles: readonly TournamentViewerRole[]): boolean {
  return myRoles.includes("host") || myRoles.includes("organizer");
}

export function isTournamentHost(myRoles: readonly TournamentViewerRole[]): boolean {
  return myRoles.includes("host");
}

export function canCheckDecks(myRoles: readonly TournamentViewerRole[]): boolean {
  return myRoles.includes("host") || myRoles.includes("organizer") || myRoles.includes("judge");
}

// Fetching the staff-gated API surfaces (the participant roster with its claim
// links) as a plain participant 403s, so gate on this first.
export function isTournamentStaff(myRoles: readonly TournamentViewerRole[]): boolean {
  return myRoles.includes("host") || myRoles.includes("organizer") || myRoles.includes("judge");
}

export function combineLocalDateTimeToUtc(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return null;
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) {
    return null;
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (year === undefined || month === undefined) {
    return null;
  }
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

export function splitUtcToLocalDateTime(iso: string): { date: string; time: string } {
  const dt = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
  };
}

export interface ParsedScheduleInput {
  startsAt: string | null;
  endsAt: string | null;
  startInvalid: boolean;
  endIncomplete: boolean;
  endBeforeStart: boolean;
  scheduleInvalid: boolean;
}

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

export function localTimeZoneLabel(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function tournamentContextLabel(
  tournament: Pick<TournamentSummaryResponse, "groupName" | "host">,
): string | null {
  if (tournament.groupName) {
    return tournament.groupName;
  }
  return tournament.host.type === "organization" ? tournament.host.displayName : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const finished = stateA === "completed" || stateA === "cancelled";
  return finished ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt);
}

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

const PARTICIPANT_STATUS_ORDER: Record<TournamentParticipantStatus, number> = {
  requested: 0,
  invited: 1,
  active: 2,
  dropped: 3,
  no_show: 4,
};

export function compareParticipantsForList(
  a: TournamentParticipantResponse,
  b: TournamentParticipantResponse,
): number {
  return (
    PARTICIPANT_STATUS_ORDER[a.status] - PARTICIPANT_STATUS_ORDER[b.status] ||
    a.displayName.localeCompare(b.displayName)
  );
}

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
