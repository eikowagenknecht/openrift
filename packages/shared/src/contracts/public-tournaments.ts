import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { tournamentStaffRoleSchema } from "@openrift/shared/contracts/tournaments";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const publicTournamentLandingResponseSchema = z
  .object({
    name: z.string(),
    hostDisplayName: z.string(),
    selfRegistrationOpen: z.boolean(),
    deckExpected: z.boolean(),
    viewerIsParticipant: z.boolean(),
  })
  .openapi("PublicTournamentLandingResponse");

export const publicTournamentJoinResponseSchema = z
  .object({
    participantId: z.string(),
    status: z.enum(["requested", "invited", "active", "dropped", "no_show"]),
    alreadyJoined: z.boolean(),
  })
  .openapi("PublicTournamentJoinResponse");

export const tournamentStaffInviteLandingResponseSchema = z
  .object({
    name: z.string(),
    hostDisplayName: z.string(),
    role: tournamentStaffRoleSchema,
    alreadyStaff: z.boolean(),
  })
  .openapi("TournamentStaffInviteLandingResponse");

export const tournamentStaffInviteClaimResponseSchema = z
  .object({
    tournamentId: z.string(),
    role: tournamentStaffRoleSchema,
    alreadyStaff: z.boolean(),
  })
  .openapi("TournamentStaffInviteClaimResponse");

const TAG = "Tournaments";

/** Respects the one-participant-per-account index: an existing participant is returned, not an error. */
export const publicTournamentsContract = {
  landing: oc
    .route({ method: "GET", path: "/api/v1/tournaments/submit/{token}", tags: [TAG] })
    .meta({ auth: "public" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicTournamentLandingResponseSchema),
  requestJoin: oc
    .route({ method: "POST", path: "/api/v1/tournaments/submit/{token}/request", tags: [TAG] })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      NOT_FOUND: { message: "Not found" },
      FORBIDDEN: { message: "Self-registration is not open" },
      CONFLICT: { message: "This tournament is no longer accepting entries" },
    })
    .input(z.object({ token: z.string().min(1) }))
    .output(publicTournamentJoinResponseSchema),

  // The landing GET grants nothing; only the session-gated claimStaffInvite POST does.
  staffInviteLanding: oc
    .route({ method: "GET", path: "/api/v1/tournaments/staff-invite/{token}", tags: [TAG] })
    .meta({ auth: "public" })
    .errors({ NOT_FOUND: { message: "Not found" } })
    .input(z.object({ token: z.string().min(1) }))
    .output(tournamentStaffInviteLandingResponseSchema),
  claimStaffInvite: oc
    .route({ method: "POST", path: "/api/v1/tournaments/staff-invite/{token}/claim", tags: [TAG] })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      NOT_FOUND: { message: "Not found" },
    })
    .input(z.object({ token: z.string().min(1) }))
    .output(tournamentStaffInviteClaimResponseSchema),
};

export type PublicTournamentsContract = typeof publicTournamentsContract;
