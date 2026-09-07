import { publicTournamentsContract } from "@openrift/shared/contracts/public-tournaments";
import type {
  PublicTournamentJoinResponse,
  PublicTournamentLandingResponse,
  TournamentStaffInviteLandingResponse,
} from "@openrift/shared/types/api/tournament";
import { implement } from "@orpc/server";

import type { Repos } from "../../../deps.js";
import { isUniqueViolation } from "../../../lib/pg-errors.js";
import { requireUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import type { Tournament } from "../repositories/tournaments.js";

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
 * Falls back to the email's local part; the raw email must never appear
 * as a public participant name.
 */
export function participantDisplayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed;
  }
  const localPart = email.split("@")[0]?.trim();
  return localPart || "Player";
}

/**
 * The one-participant-per-account index rejects a concurrent double-submit's
 * insert; that case resolves to the winning row.
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
      status: existing.status,
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
      status: created.status,
      alreadyJoined: false,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await repos.tournaments.findParticipantByUser(tournamentId, user.id);
      if (raced) {
        return {
          participantId: raced.id,
          status: raced.status,
          alreadyJoined: true,
        };
      }
    }
    throw error;
  }
}

const os = implement(publicTournamentsContract).$context<ApiContext>().use(requireUser);

export const publicTournamentsRouter = {
  landing: os.landing.handler(
    async ({ input, context, errors }): Promise<PublicTournamentLandingResponse> => {
      const repos = context.repos;
      const tournament = await repos.tournaments.findBySubmissionToken(input.token);
      if (!tournament) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
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
      const status = tournament.status;
      if (status === "completed" || status === "cancelled") {
        throw errors.CONFLICT({ message: "This tournament is no longer accepting entries" });
      }
      if (!tournament.selfRegistration) {
        throw errors.FORBIDDEN({ message: "Self-registration is not open" });
      }
      return resolveSelfJoin(repos, tournament.id, user);
    },
  ),

  staffInviteLanding: os.staffInviteLanding.handler(
    async ({ input, context, errors }): Promise<TournamentStaffInviteLandingResponse> => {
      const repos = context.repos;
      const match = await repos.tournaments.findByStaffInviteToken(input.token);
      if (!match) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
      const viewer = await context.loadUser();
      const alreadyStaff = viewer
        ? await repos.tournaments.isHostOrStaff(match.tournament.id, viewer.id, [match.role])
        : false;
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
