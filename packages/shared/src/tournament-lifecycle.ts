import type { TournamentStatus } from "./types/api/tournament.js";

export type EffectiveTournamentState = "upcoming" | "in_progress" | "completed" | "cancelled";

// Auto-complete window when no end is set: a tournament with only a start closes
// 24h after it starts (so a 23:00 event closes the next evening, never at midnight).
const AUTO_COMPLETE_GRACE_MS = 24 * 60 * 60 * 1000;

/** Shared between the web lists and the API's summary extras so both derive completion the same way. */
export function effectiveTournamentState(
  startsAt: string,
  endsAt: string | null,
  status: TournamentStatus,
  now: Date = new Date(),
): EffectiveTournamentState {
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "completed") {
    return "completed";
  }
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + AUTO_COMPLETE_GRACE_MS;
  const t = now.getTime();
  if (t >= end) {
    return "completed";
  }
  if (t >= start) {
    return "in_progress";
  }
  return "upcoming";
}
