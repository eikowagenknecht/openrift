import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  TournamentPairingStyle,
  TournamentPlayMode,
  TournamentStatus,
} from "@openrift/shared/types/api/tournament";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { Tournament } from "../repositories/tournaments.js";

/**
 * Callers must pass the effective post-merge values, not the raw update patch.
 * These functions have no access to the existing row.
 */

export function assertDateOrder(
  startsAt: Date,
  endsAt: Date | null,
  submissionsCloseAt: Date | null,
): void {
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new AppError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "The end time can't be before the start time",
    );
  }
  if (submissionsCloseAt && endsAt && submissionsCloseAt.getTime() > endsAt.getTime()) {
    throw new AppError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "Submissions must close on or before the tournament ends",
    );
  }
}

// Mirrors the DB CHECKs (chk_tournaments_play_mode_*).
export function assertPlayModeCompatible(
  playMode: TournamentPlayMode,
  pairingStyle: TournamentPairingStyle,
  regionsEnabled: boolean,
): void {
  if (playMode !== "2v2") {
    return;
  }
  if (pairingStyle === "pod") {
    throw new AppError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "2v2 team play pairs Swiss team matches — it can't combine with free-for-all pods",
    );
  }
  if (regionsEnabled) {
    throw new AppError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "Regions aren't available in 2v2 team play yet",
    );
  }
}

/** `cancelled` is also blocked upstream by the cannot-edit-cancelled guard. */
const ALLOWED_STATUS_TRANSITIONS: Record<TournamentStatus, readonly TournamentStatus[]> = {
  setup: ["setup", "running", "completed", "cancelled"],
  running: ["running", "completed", "cancelled"],
  completed: ["completed", "cancelled"],
  cancelled: ["cancelled"],
};

export function assertStatusTransition(
  current: TournamentStatus,
  next: TournamentStatus | undefined,
): void {
  if (next === undefined || next === current) {
    return;
  }
  if (!ALLOWED_STATUS_TRANSITIONS[current].includes(next)) {
    throw new AppError(409, ERROR_CODES.CONFLICT, `A ${current} tournament can't move to ${next}`);
  }
}

export function assertParticipantsOpen(tournament: Tournament): void {
  const status = tournament.status;
  if (status === "completed" || status === "cancelled") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Participants cannot be added to a completed or cancelled tournament",
    );
  }
}

// `null`/`undefined` pass (unset/clear); otherwise the value must be an
// existing custom-tag slug in the `region` category — the same vocabulary the
// Custom - Region deck format uses.
export async function assertValidRegion(
  repos: Repos,
  region: string | null | undefined,
): Promise<void> {
  if (region === null || region === undefined) {
    return;
  }
  const [tag] = await repos.customTags.listBySlugs([region]);
  if (!tag || tag.category !== "region") {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown region "${region}"`);
  }
}
