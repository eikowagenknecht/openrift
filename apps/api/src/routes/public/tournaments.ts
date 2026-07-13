import type {
  PublicTournamentJoinResponse,
  PublicTournamentLandingResponse,
  TournamentParticipantStatus,
  TournamentStaffInviteLandingResponse,
  TournamentStatus,
} from "@openrift/shared";
import { publicTournamentsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { Tournament } from "../../repositories/tournaments.js";
import { isUniqueViolation } from "../../utils/pg-errors.js";

/**
 * Resolves the host's public display name (user name or org name).
 * @returns The host display name.
 */
async function hostDisplayName(repos: Repos, tournament: Tournament): Promise<string> {
  if (tournament.hostType === "user") {
    if (!tournament.hostUserId) {
      return "Host";
    }
    const names = await repos.tournaments.getUserNames([tournament.hostUserId]);
    return names.get(tournament.hostUserId) || "Host";
  }
  const org = tournament.hostOrgId
    ? await repos.organizations.findById(tournament.hostOrgId)
    : undefined;
  return org?.name ?? "Organization";
}

/**
 * Public display name for a self-registering participant. Falls back to the
 * email's local part when the account has no (non-blank) name — the raw email
 * address must never become a publicly visible participant name.
 * @returns The name to store on the participant row.
 */
export function participantDisplayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed;
  }
  const localPart = email.split("@")[0].trim();
  return localPart || "Player";
}

/**
 * Attaches the caller to a tournament roster as a `requested` participant, or
 * returns the existing spot. Idempotent under a concurrent double-submit: the
 * one-participant-per-account partial index rejects the second insert, which we
 * catch and resolve to the winning row instead of surfacing a raw 500.
 * @returns The join response (`alreadyJoined` true when a spot already existed).
 */
export async function resolveSelfJoin(
  repos: Repos,
  tournamentId: string,
  user: { id: string; name: string | null; email: string },
): Promise<PublicTournamentJoinResponse> {
  const existing = await repos.tournaments.findParticipantByUser(tournamentId, user.id);
  if (existing) {
    return {
      participantId: existing.id,
      status: existing.status as TournamentParticipantStatus,
      alreadyJoined: true,
    };
  }
  try {
    const created = await repos.tournaments.createParticipant({
      tournamentId,
      userId: user.id,
      displayName: participantDisplayName(user.name, user.email),
      status: "requested",
      claimSource: "self_submit",
      claimedAt: new Date(),
    });
    return {
      participantId: created.id,
      status: created.status as TournamentParticipantStatus,
      alreadyJoined: false,
    };
  } catch (error) {
    // A concurrent double-submit inserted the participant between the existence
    // check and this insert; uq_tournament_participants_user rejects the second.
    if (isUniqueViolation(error)) {
      const raced = await repos.tournaments.findParticipantByUser(tournamentId, user.id);
      if (raced) {
        return {
          participantId: raced.id,
          status: raced.status as TournamentParticipantStatus,
          alreadyJoined: true,
        };
      }
    }
    throw error;
  }
}

const os = implement(publicTournamentsContract).$context<ApiContext>().use(requireUser);

/**
 * Public, token-gated request-to-join surface for the umbrella (ADR-033). The
 * landing is unauthenticated; `requestJoin` requires a session and, when
 * self-registration is open, creates a `requested` participant for the caller
 * (the approval gate). An existing participant is returned, never duplicated.
 */
export const publicTournamentsRouter = {
  landing: os.landing.handler(
    async ({ input, context, errors }): Promise<PublicTournamentLandingResponse> => {
      const repos = context.repos;
      const tournament = await repos.tournaments.findBySubmissionToken(input.token);
      if (!tournament) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
      // The landing is public, so resolve the session lazily (anonymous → null)
      // only to tell the client whether the viewer already holds a spot. That
      // gates deck submission when self-registration is closed.
      const viewer = await context.loadUser();
      const viewerIsParticipant = viewer
        ? Boolean(await repos.tournaments.findParticipantByUser(tournament.id, viewer.id))
        : false;
      return {
        name: tournament.name,
        hostDisplayName: await hostDisplayName(repos, tournament),
        selfRegistrationOpen: tournament.selfRegistration,
        deckExpected: tournament.deckSubmission !== "none",
        viewerIsParticipant,
      };
    },
  ),

  requestJoin: os.requestJoin.handler(
    async ({ input, context, errors }): Promise<PublicTournamentJoinResponse> => {
      const repos = context.repos;
      const user = context.user;
      if (!user) {
        throw errors.UNAUTHORIZED({ message: "Unauthorized" });
      }
      const tournament = await repos.tournaments.findBySubmissionToken(input.token);
      if (!tournament) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
      // A completed or cancelled tournament must not accept new entrants even if
      // the self-registration flag and its share token are still live. This is a
      // terminal-state conflict (409), matching the authenticated `update` /
      // `addParticipant` and pod `submitResult` guards; `selfRegistration` off is
      // a host-toggled policy gate (403), kept distinct so the client can tell
      // "tournament is over" from "sign-ups aren't open".
      const status = tournament.status as TournamentStatus;
      if (status === "completed" || status === "cancelled") {
        throw errors.CONFLICT({ message: "This tournament is no longer accepting entries" });
      }
      if (!tournament.selfRegistration) {
        throw errors.FORBIDDEN({ message: "Self-registration is not open" });
      }
      // Respect the one-participant-per-account index: return the existing one,
      // and stay idempotent if a concurrent submit wins the insert race.
      return resolveSelfJoin(repos, tournament.id, user);
    },
  ),

  staffInviteLanding: os.staffInviteLanding.handler(
    async ({ input, context, errors }): Promise<TournamentStaffInviteLandingResponse> => {
      const repos = context.repos;
      const user = context.user;
      if (!user) {
        throw errors.UNAUTHORIZED({ message: "Unauthorized" });
      }
      const match = await repos.tournaments.findByStaffInviteToken(input.token);
      if (!match) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
      const alreadyStaff = await repos.tournaments.isHostOrStaff(match.tournament.id, user.id, [
        match.role,
      ]);
      return {
        name: match.tournament.name,
        hostDisplayName: await hostDisplayName(repos, match.tournament),
        role: match.role,
        alreadyStaff,
      };
    },
  ),

  claimStaffInvite: os.claimStaffInvite.handler(async ({ input, context, errors }) => {
    const repos = context.repos;
    const user = context.user;
    if (!user) {
      throw errors.UNAUTHORIZED({ message: "Unauthorized" });
    }
    const match = await repos.tournaments.findByStaffInviteToken(input.token);
    if (!match) {
      throw errors.NOT_FOUND({ message: "Not found" });
    }
    const alreadyStaff = await repos.tournaments.isHostOrStaff(match.tournament.id, user.id, [
      match.role,
    ]);
    // Idempotent: addStaff no-ops on the (tournament, user, role) key, so a second
    // confirm (or a refresh) is harmless.
    await repos.tournaments.addStaff(match.tournament.id, user.id, match.role);
    return { tournamentId: match.tournament.id, role: match.role, alreadyStaff };
  }),
};
