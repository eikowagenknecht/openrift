import type { TournamentStatus } from "./types/index.js";

/** The lifecycle state a tournament is effectively in, derived from its dates. */
export type EffectiveTournamentState = "upcoming" | "in_progress" | "completed" | "cancelled";

// Auto-complete window when no end is set: a tournament with only a start closes
// 24h after it starts (so a 23:00 event closes the next evening, never at midnight).
const AUTO_COMPLETE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Effective lifecycle state derived from the stored instants + status.
 * Completion is automatic (no host action): once now is past the end (ends_at,
 * or starts_at + 24h when there is no end). `cancelled` and an explicit
 * `completed` status (e.g. ended early) win. `now` is injectable for tests.
 *
 * Shared between the web lists and the API's summary extras, so both sides
 * agree on when a tournament counts as finished (the stored status stays
 * `running` forever unless the host acts).
 *
 * @returns The effective state.
 */
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
