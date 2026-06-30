import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { podTournamentDetailResponseSchema } from "@openrift/shared/response-schemas";
import {
  friendGroupSlugParamSchema,
  isoDateTime,
  podResultSchema,
  withParams,
} from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

// ─── Enums ─────────────────────────────────────────────────────────────────

const tournamentStatusSchema = z.enum(["setup", "running", "completed", "cancelled"]);
const tournamentPairingStyleSchema = z.enum(["none", "pod"]);
const tournamentDeckSubmissionSchema = z.enum(["none", "optional", "required"]);
const tournamentDeckPhaseSchema = z.enum(["open", "closed", "locked"]);
const tournamentListLockModeSchema = z.enum(["on_submit", "at_deadline"]);
const tournamentStaffRoleSchema = z.enum(["organizer", "judge"]);
const tournamentParticipantStatusSchema = z.enum([
  "requested",
  "invited",
  "active",
  "dropped",
  "no_show",
]);
const tournamentViewerRoleSchema = z.enum(["host", "organizer", "judge", "participant"]);
const scoringSchemeSchema = z.enum(["standard", "three_pod_reduced"]);

// ─── Response schemas ──────────────────────────────────────────────────────

const tournamentHostInfoSchema = z.object({
  type: z.enum(["user", "organization"]),
  userId: z.string().nullable(),
  orgId: z.string().nullable(),
  displayName: z.string(),
  orgSlug: z.string().nullable(),
});

const tournamentModuleFlagsSchema = z.object({
  pairing: z.boolean(),
  deckSubmission: z.boolean(),
});

export const tournamentStaffMemberResponseSchema = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    role: tournamentStaffRoleSchema,
    // "grant" is an explicit tournament_staff row (removable here); "organization"
    // is an implicit staff member of the host org (owner/manager as organizer, or
    // judge as judge).
    source: z.enum(["grant", "organization"]),
    orgRole: z.enum(["owner", "manager", "judge"]).nullable(),
    addedAt: z.string(),
  })
  .openapi("TournamentStaffMemberResponse");

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
    deckSubmission: tournamentDeckSubmissionSchema,
    deckFormat: z.string().nullable(),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    modules: tournamentModuleFlagsSchema,
    participantCount: z.number().int().nonnegative(),
    pendingRequestCount: z.number().int().nonnegative(),
    myRoles: z.array(tournamentViewerRoleSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TournamentSummaryResponse");

export const tournamentListResponseSchema = z
  .object({ items: z.array(tournamentSummaryResponseSchema) })
  .openapi("TournamentListResponse");

export const tournamentDetailResponseSchema = tournamentSummaryResponseSchema
  .extend({
    currentRound: z.number().int().nonnegative(),
    scoringScheme: scoringSchemeSchema,
    byePoints: z.number().int().nonnegative(),
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
    /** True once any round exists; the pairing engine can no longer be changed. */
    hasRounds: z.boolean(),
  })
  .openapi("TournamentDetailResponse");

const tournamentStaffCandidateResponseSchema = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    source: z.enum(["group", "participant"]),
  })
  .openapi("TournamentStaffCandidateResponse");

const tournamentStaffCandidateListResponseSchema = z
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
    droppedAfterRound: z.number().int().nullable(),
    claimToken: z.string().nullable(),
    /** A judge unlinked a wrong account; the spot is blocked until a re-issue. */
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

// ─── Input schemas ─────────────────────────────────────────────────────────

const hostInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user") }),
  z.object({ type: z.literal("organization"), orgId: z.uuid() }),
]);

export const createTournamentSchema = z.object({
  name: z.string().min(1).max(120),
  host: hostInputSchema,
  pairingStyle: tournamentPairingStyleSchema,
  scoringScheme: scoringSchemeSchema.optional(),
  byePoints: z.number().int().min(0).max(99).optional(),
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
  // Reassign the host (personal ↔ organization). Host-only; the target org
  // requires the caller to be one of its members (owner/manager).
  host: hostInputSchema.optional(),
  // The pairing engine. Only honored while the tournament has no rounds yet (the
  // handler 409s otherwise, since rounds/pods depend on it).
  pairingStyle: tournamentPairingStyleSchema.optional(),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.nullable().optional(),
  scoringScheme: scoringSchemeSchema.optional(),
  byePoints: z.number().int().min(0).max(99).optional(),
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
const staffParamSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  role: tournamentStaffRoleSchema,
});

// ─── Pod-engine running input (pod_rounds format) ──────────────────────────

const roundNumberParamSchema = z.object({
  id: z.uuid(),
  roundNumber: z.coerce.number().int().positive(),
});
const podParamSchema = z.object({ id: z.uuid(), podId: z.uuid() });

/**
 * Pair the next round. `byes` lists active players the organizer is sitting out
 * this round (manual byes); the rest are paired. Resolves an otherwise
 * unrepresentable count (1, 2, or 5 active players) or sits a leaver out.
 */
const generateRoundSchema = z.object({ byes: z.array(z.uuid()).default([]) });

/**
 * A manual whole-round pairing edit: the new pods plus the players sitting out.
 * The server validates pod sizes (3 or 4), full coverage of the round's players,
 * and that byes are active, then recomputes the penalty.
 */
const replacePairingSchema = z.object({
  pods: z
    .array(
      z.object({
        size: z.union([z.literal(3), z.literal(4)]),
        playerIds: z.array(z.uuid()),
      }),
    )
    .min(0),
  byes: z.array(z.uuid()),
});

const validationError = { VALIDATION_ERROR: { status: 422 as const, message: "Invalid settings" } };

/**
 * Authenticated oRPC contract for the unified tournaments umbrella (ADR-033),
 * mounted at `/api/v1/tournaments`. Authorization composes host authority (the
 * hosting user, or an organization owner/manager) with `tournament_staff`
 * grants; the route handlers enforce it. `VALIDATION_ERROR` (422) carries the
 * cross-field CHECK-invariant rejections on create/update.
 */
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

  // ── Staff ──────────────────────────────────────────────────────────────────
  listStaff: authedRoute
    .route({ method: "GET", path: `${BASE}/{id}/staff`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentStaffListResponseSchema),
  // People the host can grant staff to without an email: linked group members
  // and account-linked participants. Powers the add-staff picker.
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
        // Added by account id from the candidate picker — no email, no user
        // search; the handler re-checks eligibility so a forged id is rejected.
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

  // ── Participants ─────────────────────────────────────────────────────────
  listParticipants: authedRoute
    .route({ method: "GET", path: `${BASE}/{id}/participants`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(idParamSchema)
    .output(tournamentParticipantListResponseSchema),
  addParticipant: authedRoute
    .route({ method: "POST", path: `${BASE}/{id}/participants`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(withParams(idParamSchema, { displayName: z.string().min(1).max(120) }))
    .output(tournamentParticipantListResponseSchema),
  updateParticipant: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{id}/participants/{participantId}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament or participant not found" } })
    .input(
      withParams(participantParamSchema, {
        displayName: z.string().min(1).max(120).optional(),
        seed: z.number().int().nullable().optional(),
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
  // Clears the claim block an unlink leaves behind and rotates the claim token,
  // so the correct player can claim the spot through a fresh link (ADR-033). The
  // only recovery path once a wrong account was unlinked, now that staff cannot
  // link accounts directly.
  reissueClaim: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/{id}/participants/{participantId}/reissue-claim`,
      tags: [TAG],
    })
    .errors({ NOT_FOUND: { message: "Tournament or participant not found" } })
    .input(participantParamSchema)
    .output(tournamentParticipantListResponseSchema),

  // ── Running (pod_rounds format) ────────────────────────────────────────────
  // The pod engine's pairings + standings, keyed by the same tournament id.
  // `runState` is readable by anyone with a relationship to the tournament (the
  // 404 mirrors the detail gate); the round-running mutations require manage
  // authority (host or organizer).
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
