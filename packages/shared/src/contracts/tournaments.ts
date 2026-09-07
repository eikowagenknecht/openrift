import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { organizationRoleSchema } from "@openrift/shared/contracts/organizations";
import {
  deckCheckEntryStateSchema,
  deckCheckReviewOutcomeSchema,
  podMatchFormatSchema,
  podPairingStyleSchema,
  podPlayModeSchema,
  podScoringSchemeSchema,
  podTournamentDetailResponseSchema,
  TOURNAMENT_STATUSES,
} from "@openrift/shared/response-schemas";
import {
  friendGroupSlugParamSchema,
  isoDateTime,
  podResultSchema,
  withParams,
} from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const tournamentStatusSchema = z.enum(TOURNAMENT_STATUSES);
// Re-exported from response-schemas.ts: the pod engine reads the same columns.
export const tournamentPairingStyleSchema = podPairingStyleSchema;
export const tournamentPlayModeSchema = podPlayModeSchema;
export const tournamentMatchFormatSchema = podMatchFormatSchema;
export const tournamentDeckSubmissionSchema = z.enum(["none", "optional", "required"]);
export const tournamentDeckPhaseSchema = z.enum(["open", "closed", "locked"]);
export const tournamentListLockModeSchema = z.enum(["on_submit", "at_deadline"]);
export const tournamentStaffRoleSchema = z.enum(["organizer", "judge"]);
export const tournamentParticipantStatusSchema = z.enum([
  "requested",
  "invited",
  "active",
  "dropped",
  "no_show",
]);
const tournamentViewerRoleSchema = z.enum(["host", "organizer", "judge", "participant"]);
export const scoringSchemeSchema = podScoringSchemeSchema;

export const tournamentHostInfoSchema = z.object({
  type: z.enum(["user", "organization"]),
  userId: z.string().nullable(),
  orgId: z.string().nullable(),
  displayName: z.string(),
  orgSlug: z.string().nullable(),
});

export const tournamentModuleFlagsSchema = z.object({
  pairing: z.boolean(),
  deckSubmission: z.boolean(),
});

export const tournamentStaffMemberResponseSchema = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    role: tournamentStaffRoleSchema,
    // "grant" is an explicit tournament_staff row; "organization" is an
    // implicit staff member of the host org.
    source: z.enum(["grant", "organization"]),
    orgRole: organizationRoleSchema.nullable(),
    addedAt: z.string(),
  })
  .openapi("TournamentStaffMemberResponse");

export const TOURNAMENT_PARTICIPANT_PREVIEW_COUNT = 5;

export const TOURNAMENT_COVER_LEGEND_COUNT = 3;

export const tournamentParticipantPreviewSchema = z
  .object({
    name: z.string(),
    image: z.string().nullable(),
    gravatarHash: z.string().nullable(),
  })
  .openapi("TournamentParticipantPreview");

/** The legend art is only present when the winner consented to deck publishing. */
export const tournamentWinnerSchema = z
  .object({
    name: z.string(),
    legendImageId: z.string().nullable(),
  })
  .openapi("TournamentWinner");

export const tournamentCoverLegendSchema = z
  .object({
    printingId: z.string(),
    imageId: z.string(),
  })
  .openapi("TournamentCoverLegend");

export const tournamentSummaryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: tournamentStatusSchema,
    host: tournamentHostInfoSchema,
    groupId: z.string().nullable(),
    groupSlug: z.string().nullable(),
    groupName: z.string().nullable(),
    pairingStyle: tournamentPairingStyleSchema,
    playMode: tournamentPlayModeSchema,
    deckSubmission: tournamentDeckSubmissionSchema,
    deckFormat: z.string().nullable(),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    modules: tournamentModuleFlagsSchema,
    participantCount: z.number().int().nonnegative(),
    pendingRequestCount: z.number().int().nonnegative(),
    myRoles: z.array(tournamentViewerRoleSchema),
    participantPreview: z.array(tournamentParticipantPreviewSchema),
    winner: tournamentWinnerSchema.nullable(),
    coverLegends: z.array(tournamentCoverLegendSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TournamentSummaryResponse");

export const tournamentListResponseSchema = z
  .object({ items: z.array(tournamentSummaryResponseSchema) })
  .openapi("TournamentListResponse");

/** Null when the viewer holds no entry: not a participant, or no decks taken. */
export const tournamentMyDeckEntrySchema = z.object({
  id: z.string(),
  state: deckCheckEntryStateSchema,
  reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
  unlockRequested: z.boolean(),
  hasPlayerMessage: z.boolean(),
});

export const tournamentDetailResponseSchema = tournamentSummaryResponseSchema
  .extend({
    myDeckEntry: tournamentMyDeckEntrySchema.nullable(),
    currentRound: z.number().int().nonnegative(),
    scoringScheme: scoringSchemeSchema,
    byePoints: z.number().int().nonnegative(),
    matchFormat: tournamentMatchFormatSchema,
    winPoints: z.number().int().nonnegative(),
    drawPoints: z.number().int().nonnegative(),
    regionsEnabled: z.boolean(),
    deckPhase: tournamentDeckPhaseSchema,
    submissionsCloseAt: z.string().nullable(),
    listLockMode: tournamentListLockModeSchema,
    allowedSets: z.array(z.string()).nullable(),
    selfRegistration: z.boolean(),
    reportToken: z.string().nullable(),
    followToken: z.string().nullable(),
    submissionToken: z.string().nullable(),
    organizerInviteToken: z.string().nullable(),
    judgeInviteToken: z.string().nullable(),
    staff: z.array(tournamentStaffMemberResponseSchema),
    hasRounds: z.boolean(),
  })
  .openapi("TournamentDetailResponse");

export const tournamentStaffCandidateResponseSchema = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    source: z.enum(["group", "participant"]),
  })
  .openapi("TournamentStaffCandidateResponse");

export const tournamentStaffCandidateListResponseSchema = z
  .object({ items: z.array(tournamentStaffCandidateResponseSchema) })
  .openapi("TournamentStaffCandidateListResponse");

export const tournamentParticipantResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string().nullable(),
    userName: z.string().nullable(),
    displayName: z.string(),
    riotId: z.string().nullable(),
    status: tournamentParticipantStatusSchema,
    seed: z.number().int().nullable(),
    // Teams have no stored name; the pair of member display names is the
    // team identity.
    teamId: z.string().nullable(),
    region: z.string().nullable(),
    // Soft: steers which table the player's pod lands on, never who they
    // are paired with.
    fixedTable: z.number().int().nullable(),
    droppedAfterRound: z.number().int().nullable(),
    claimToken: z.string().nullable(),
    claimBlocked: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TournamentParticipantResponse");

export const tournamentParticipantListResponseSchema = z
  .object({ items: z.array(tournamentParticipantResponseSchema) })
  .openapi("TournamentParticipantListResponse");

const tournamentStaffListResponseSchema = z
  .object({ items: z.array(tournamentStaffMemberResponseSchema) })
  .openapi("TournamentStaffListResponse");

const hostInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user") }),
  z.object({ type: z.literal("organization"), orgId: z.uuid() }),
]);

export const createTournamentSchema = z.object({
  name: z.string().min(1).max(120),
  host: hostInputSchema,
  pairingStyle: tournamentPairingStyleSchema,
  // Composes with 'swiss' or 'none'; rejected with 'pod' or regionsEnabled.
  playMode: tournamentPlayModeSchema.optional(),
  scoringScheme: scoringSchemeSchema.optional(),
  byePoints: z.number().int().min(0).max(99).optional(),
  matchFormat: tournamentMatchFormatSchema.optional(),
  winPoints: z.number().int().min(0).max(99).optional(),
  drawPoints: z.number().int().min(0).max(99).optional(),
  regionsEnabled: z.boolean().optional(),
  deckSubmission: tournamentDeckSubmissionSchema,
  submissionsCloseAt: isoDateTime.nullable().optional(),
  listLockMode: tournamentListLockModeSchema.optional(),
  deckFormat: z.string().min(1).nullable().optional(),
  allowedSets: z.array(z.string()).nullable().optional(),
  selfRegistration: z.boolean().optional(),
  groupId: z.uuid().nullable().optional(),
  startsAt: isoDateTime,
  endsAt: isoDateTime.nullable().optional(),
});

export const updateTournamentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: tournamentStatusSchema.optional(),
  // Host-only; reassigning to an org requires the caller be one of its
  // owner/manager members.
  host: hostInputSchema.optional(),
  // Only honored while the tournament has no rounds yet (409 otherwise).
  pairingStyle: tournamentPairingStyleSchema.optional(),
  // Only honored while the tournament has no rounds yet. Switching to 2v2
  // also requires no pod pairing or regions; leaving 2v2 requires no teams.
  playMode: tournamentPlayModeSchema.optional(),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.nullable().optional(),
  scoringScheme: scoringSchemeSchema.optional(),
  byePoints: z.number().int().min(0).max(99).optional(),
  // Only honored while the tournament has no rounds yet (409 otherwise).
  matchFormat: tournamentMatchFormatSchema.optional(),
  winPoints: z.number().int().min(0).max(99).optional(),
  drawPoints: z.number().int().min(0).max(99).optional(),
  regionsEnabled: z.boolean().optional(),
  deckSubmission: tournamentDeckSubmissionSchema.optional(),
  submissionsCloseAt: isoDateTime.nullable().optional(),
  listLockMode: tournamentListLockModeSchema.optional(),
  deckFormat: z.string().min(1).nullable().optional(),
  allowedSets: z.array(z.string()).nullable().optional(),
  selfRegistration: z.boolean().optional(),
  groupId: z.uuid().nullable().optional(),
});

const TAG = "Tournaments";
const BASE = "/api/v1/tournaments";

const idParamSchema = z.object({ id: z.uuid() });
const participantParamSchema = z.object({ id: z.uuid(), participantId: z.uuid() });
const teamParamSchema = z.object({ id: z.uuid(), teamId: z.uuid() });
const staffParamSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  role: tournamentStaffRoleSchema,
});

const roundNumberParamSchema = z.object({
  id: z.uuid(),
  roundNumber: z.coerce.number().int().positive(),
});
const podParamSchema = z.object({ id: z.uuid(), podId: z.uuid() });

/** `byes` lists active players the organizer is manually sitting out this round. */
const generateRoundSchema = z.object({ byes: z.array(z.uuid()).default([]) });

/** Server validates pod sizes per pairing style, full round coverage, and active byes. */
const replacePairingSchema = z.object({
  pods: z
    .array(
      z.object({
        size: z.union([z.literal(2), z.literal(3), z.literal(4)]),
        playerIds: z.array(z.uuid()),
      }),
    )
    .min(0),
  byes: z.array(z.uuid()),
});

const validationError = { VALIDATION_ERROR: { status: 422 as const, message: "Invalid settings" } };

// Authorization composes host authority with tournament_staff grants,
// enforced by the route handlers.
export const tournamentsContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(tournamentListResponseSchema),
  listForGroup: authedRoute
    .route({ method: "GET", path: "/api/v1/friend-groups/{slug}/tournaments", tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .input(friendGroupSlugParamSchema)
    .output(tournamentListResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .errors({
      ...validationError,
      NOT_FOUND: { message: "Host organization or group not found" },
    })
    .input(createTournamentSchema)
    .output(tournamentDetailResponseSchema),
  get: authedRoute
    .route({ method: "GET", path: `${BASE}/{id}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentDetailResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{id}`, tags: [TAG] })
    .errors({
      ...validationError,
      NOT_FOUND: { message: "Tournament not found" },
      CONFLICT: { message: "A cancelled tournament cannot be edited" },
    })
    .input(withParams(idParamSchema, updateTournamentSchema))
    .output(tournamentDetailResponseSchema),
  cancel: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/cancel`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentDetailResponseSchema),
  remove: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema),
  enableSubmissionToken: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/submission-token`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentDetailResponseSchema),
  disableSubmissionToken: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{id}/submission-token`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentDetailResponseSchema),

  listStaff: authedRoute
    .route({ method: "GET", path: `${BASE}/{id}/staff`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentStaffListResponseSchema),
  // Linked group members and account-linked participants: staff grantable
  // without an email.
  listStaffCandidates: authedRoute
    .route({ method: "GET", path: `${BASE}/{id}/staff/candidates`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentStaffCandidateListResponseSchema),
  addStaff: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/staff`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(
      withParams(idParamSchema, {
        // Added by account id; the handler re-checks eligibility so a
        // forged id is rejected.
        userId: z.string().min(1),
        role: tournamentStaffRoleSchema,
      }),
    )
    .output(tournamentStaffListResponseSchema),
  removeStaff: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{id}/staff/{userId}/{role}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(staffParamSchema)
    .output(tournamentStaffListResponseSchema),
  enableStaffInvite: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/staff-invite`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(withParams(idParamSchema, { role: tournamentStaffRoleSchema }))
    .output(tournamentDetailResponseSchema),
  disableStaffInvite: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{id}/staff-invite/{role}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(z.object({ id: z.uuid(), role: tournamentStaffRoleSchema }))
    .output(tournamentDetailResponseSchema),

  listParticipants: authedRoute
    .route({ method: "GET", path: `${BASE}/{id}/participants`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentParticipantListResponseSchema),
  addParticipant: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/participants`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(
      withParams(idParamSchema, {
        displayName: z.string().min(1).max(120),
        region: z.string().min(1).max(50).nullable().optional(),
        fixedTable: z.number().int().min(1).max(999).nullable().optional(),
      }),
    )
    .output(tournamentParticipantListResponseSchema),
  updateParticipant: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{id}/participants/{participantId}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament or participant not found" } })
    .input(
      withParams(participantParamSchema, {
        displayName: z.string().min(1).max(120).optional(),
        seed: z.number().int().nullable().optional(),
        // Judges may patch region alone; other fields stay organizer/host-only.
        region: z.string().min(1).max(50).nullable().optional(),
        fixedTable: z.number().int().min(1).max(999).nullable().optional(),
      }),
    )
    .output(tournamentParticipantListResponseSchema),
  dropParticipant: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/participants/{participantId}/drop`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament or participant not found" } })
    .input(participantParamSchema)
    .output(tournamentParticipantListResponseSchema),
  reactivateParticipant: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/{id}/participants/{participantId}/reactivate`,
      tags: [TAG],
    })
    .errors({ NOT_FOUND: { message: "Tournament or participant not found" } })
    .input(participantParamSchema)
    .output(tournamentParticipantListResponseSchema),
  approveParticipant: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/{id}/participants/{participantId}/approve`,
      tags: [TAG],
    })
    .errors({
      NOT_FOUND: { message: "Tournament or participant not found" },
      CONFLICT: { message: "Only a pending request can be approved" },
    })
    .input(participantParamSchema)
    .output(tournamentParticipantListResponseSchema),
  denyParticipant: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/participants/{participantId}/deny`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or participant not found" },
      CONFLICT: { message: "Only a pending request can be denied" },
    })
    .input(participantParamSchema)
    .output(tournamentParticipantListResponseSchema),
  removeParticipant: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{id}/participants/{participantId}`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or participant not found" },
      CONFLICT: { message: "Participant is in a paired round and cannot be removed" },
    })
    .input(participantParamSchema)
    .output(tournamentParticipantListResponseSchema),
  unlinkParticipant: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/{id}/participants/{participantId}/unlink`,
      tags: [TAG],
    })
    .errors({ NOT_FOUND: { message: "Tournament or participant not found" } })
    .input(participantParamSchema)
    .output(tournamentParticipantListResponseSchema),
  // Clears the claim block an unlink leaves and rotates the claim token so
  // the correct player can claim the spot through a fresh link.
  reissueClaim: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/{id}/participants/{participantId}/reissue-claim`,
      tags: [TAG],
    })
    .errors({ NOT_FOUND: { message: "Tournament or participant not found" } })
    .input(participantParamSchema)
    .output(tournamentParticipantListResponseSchema),

  // Membership rides on the participant rows (`teamId`), so both mutations
  // answer with the participant list.
  createTeam: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/teams`, tags: [TAG], successStatus: 201 })
    .errors({
      NOT_FOUND: { message: "Tournament or participant not found" },
      CONFLICT: { message: "A participant is already on a team" },
      BAD_REQUEST: { message: "Teams need exactly two active participants of a 2v2 tournament" },
    })
    .input(withParams(idParamSchema, { participantIds: z.array(z.uuid()).length(2) }))
    .output(tournamentParticipantListResponseSchema),
  dissolveTeam: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{id}/teams/{teamId}`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or team not found" },
      CONFLICT: { message: "A team that has played a round cannot be dissolved" },
    })
    .input(teamParamSchema)
    .output(tournamentParticipantListResponseSchema),

  // `runState` is readable by anyone with a relationship to the tournament;
  // round-running mutations require host or organizer authority.
  runState: authedRoute
    .route({ method: "GET", path: `${BASE}/{id}/run`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(podTournamentDetailResponseSchema),
  generateRound: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/rounds`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament not found" },
      CONFLICT: { message: "A round is already open" },
      BAD_REQUEST: { message: "Invalid player count or bye selection" },
    })
    .input(withParams(idParamSchema, generateRoundSchema))
    .output(podTournamentDetailResponseSchema),
  replacePairing: authedRoute
    .route({ method: "PUT", path: `${BASE}/{id}/rounds/{roundNumber}/pairing`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or round not found" },
      BAD_REQUEST: { message: "Invalid pod sizes or player assignment" },
    })
    .input(withParams(roundNumberParamSchema, replacePairingSchema))
    .output(podTournamentDetailResponseSchema),
  rerollRound: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/rounds/{roundNumber}/reroll`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or round not found" },
      BAD_REQUEST: { message: "Round is finalized or has results entered" },
    })
    .input(roundNumberParamSchema)
    .output(podTournamentDetailResponseSchema),
  finalizeRound: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/rounds/{roundNumber}/finalize`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or round not found" },
      CONFLICT: { message: "Round is already finalized" },
      BAD_REQUEST: { message: "Not all pods have results" },
    })
    .input(roundNumberParamSchema)
    .output(podTournamentDetailResponseSchema),
  submitResult: authedRoute
    .route({ method: "PUT", path: `${BASE}/{id}/pods/{podId}/result`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or pod not found" },
      BAD_REQUEST: { message: "Invalid result set for this pod" },
    })
    .input(withParams(podParamSchema, podResultSchema))
    .output(podTournamentDetailResponseSchema),
  enableReportToken: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/report-token`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentDetailResponseSchema),
  disableReportToken: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{id}/report-token`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentDetailResponseSchema),
  enableFollowToken: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/follow-token`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentDetailResponseSchema),
  disableFollowToken: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{id}/follow-token`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentDetailResponseSchema),
};

export type TournamentsContract = typeof tournamentsContract;
