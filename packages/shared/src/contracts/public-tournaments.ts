import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const publicTournamentLandingResponseSchema = z
  .object({
    name: z.string(),
    hostDisplayName: z.string(),
    selfRegistrationOpen: z.boolean(),
    deckExpected: z.boolean(),
    // True when the signed-in viewer already holds a spot in this tournament.
    // Drives the link's deck-submission gate when self-registration is closed:
    // a claimed participant can still submit, a stranger must claim first.
    // Always false for an anonymous viewer.
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

const tournamentStaffRoleSchema = z.enum(["organizer", "judge"]);

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

/**
 * Public, token-gated request-to-join surface for the unified tournaments
 * umbrella (ADR-033). `landing` is unauthenticated minimal info for the
 * submission link; `requestJoin` requires a session and, when self-registration
 * is open, creates a `requested` participant for the caller (the approval gate).
 * Respects the one-participant-per-account index — an existing participant is
 * returned instead of erroring.
 */
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

  // Staff-invite link. The landing is read-only (a session is required, so link
  // scanners get a 401, not a grant); `claimStaffInvite` is the explicit confirm
  // POST that actually grants the role. Reusable until the host rotates the link.
  staffInviteLanding: oc
    .route({ method: "GET", path: "/api/v1/tournaments/staff-invite/{token}", tags: [TAG] })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      NOT_FOUND: { message: "Not found" },
    })
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
