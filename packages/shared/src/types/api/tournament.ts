// Pod-pairing response shapes live in ./pod-tournament.ts; this file carries
// the umbrella-level enums and the host/staff/participant entities.

import type { deckCheckClaimSourceSchema } from "@openrift/shared/contracts/deck-check";
import type {
  organizationDetailResponseSchema,
  organizationListResponseSchema,
  organizationMemberResponseSchema,
  organizationResponseSchema,
  organizationRoleSchema,
  organizationSummaryResponseSchema,
} from "@openrift/shared/contracts/organizations";
import type {
  publicTournamentJoinResponseSchema,
  publicTournamentLandingResponseSchema,
  tournamentStaffInviteLandingResponseSchema,
} from "@openrift/shared/contracts/public-tournaments";
import type {
  tournamentCoverLegendSchema,
  tournamentDeckPhaseSchema,
  tournamentDeckSubmissionSchema,
  tournamentDetailResponseSchema,
  tournamentHostInfoSchema,
  tournamentListLockModeSchema,
  tournamentListResponseSchema,
  tournamentMatchFormatSchema,
  tournamentModuleFlagsSchema,
  tournamentMyDeckEntrySchema,
  tournamentPairingStyleSchema,
  tournamentParticipantListResponseSchema,
  tournamentParticipantPreviewSchema,
  tournamentParticipantResponseSchema,
  tournamentParticipantStatusSchema,
  tournamentPlayModeSchema,
  tournamentStaffCandidateListResponseSchema,
  tournamentStaffCandidateResponseSchema,
  tournamentStaffMemberResponseSchema,
  tournamentStaffRoleSchema,
  tournamentSummaryResponseSchema,
  tournamentWinnerSchema,
} from "@openrift/shared/contracts/tournaments";
import type { TOURNAMENT_STATUSES } from "@openrift/shared/response-schemas";
import type { z } from "zod";

export type TournamentHostType = z.infer<typeof tournamentHostInfoSchema>["type"];

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

/**
 * `none` = no rounds or pairings; `pod` = 3/4-player pod rounds; `swiss` =
 * 1v1 Swiss matches.
 */
export type TournamentPairingStyle = z.infer<typeof tournamentPairingStyleSchema>;

/**
 * `2v2` composes with `swiss` (team Swiss) and `none` (deck-only, checked
 * against the 2v2 banlist); rejected with `pod` and with the region layer.
 */
export type TournamentPlayMode = z.infer<typeof tournamentPlayModeSchema>;

export type TournamentMatchFormat = z.infer<typeof tournamentMatchFormatSchema>;

/**
 * Every submission produces a deck-check entry, so a tournament that
 * collects lists is checkable by judges; there is no separate switch for that.
 */
export type TournamentDeckSubmission = z.infer<typeof tournamentDeckSubmissionSchema>;

export type TournamentDeckPhase = z.infer<typeof tournamentDeckPhaseSchema>;

export type TournamentListLockMode = z.infer<typeof tournamentListLockModeSchema>;

export type TournamentStaffRole = z.infer<typeof tournamentStaffRoleSchema>;

/**
 * `owner`/`manager` inherit organizer authority on every tournament the org
 * hosts; `judge` inherits judge authority only, with no org-admin access.
 */
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export type TournamentParticipantStatus = z.infer<typeof tournamentParticipantStatusSchema>;

/** Derives from the same schema as {@link DeckCheckClaimSource} in `deck-check.ts`. */
export type TournamentClaimSource = z.infer<typeof deckCheckClaimSourceSchema>;

export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

export type OrganizationMemberResponse = z.infer<typeof organizationMemberResponseSchema>;

export type TournamentStaffMemberResponse = z.infer<typeof tournamentStaffMemberResponseSchema>;

export type OrganizationDetailResponse = z.infer<typeof organizationDetailResponseSchema>;

export type OrganizationSummaryResponse = z.infer<typeof organizationSummaryResponseSchema>;

export type OrganizationListResponse = z.infer<typeof organizationListResponseSchema>;

export type TournamentViewerRole = z.infer<
  typeof tournamentSummaryResponseSchema
>["myRoles"][number];

export type TournamentHostInfo = z.infer<typeof tournamentHostInfoSchema>;

export type TournamentModuleFlags = z.infer<typeof tournamentModuleFlagsSchema>;

export type TournamentParticipantPreview = z.infer<typeof tournamentParticipantPreviewSchema>;

export type TournamentWinner = z.infer<typeof tournamentWinnerSchema>;

export type TournamentCoverLegend = z.infer<typeof tournamentCoverLegendSchema>;

export type TournamentMyDeckEntry = z.infer<typeof tournamentMyDeckEntrySchema>;

export type TournamentSummaryResponse = z.infer<typeof tournamentSummaryResponseSchema>;

export type TournamentListResponse = z.infer<typeof tournamentListResponseSchema>;

export type TournamentDetailResponse = z.infer<typeof tournamentDetailResponseSchema>;

/**
 * Someone a host can grant staff to without typing an email: a member of the
 * linked friend group, or an account-linked participant. `source` says which.
 */
export type TournamentStaffCandidateResponse = z.infer<
  typeof tournamentStaffCandidateResponseSchema
>;

export type TournamentStaffCandidateListResponse = z.infer<
  typeof tournamentStaffCandidateListResponseSchema
>;

export type TournamentStaffInviteLandingResponse = z.infer<
  typeof tournamentStaffInviteLandingResponseSchema
>;

export type TournamentParticipantResponse = z.infer<typeof tournamentParticipantResponseSchema>;

export type TournamentParticipantListResponse = z.infer<
  typeof tournamentParticipantListResponseSchema
>;

export type PublicTournamentLandingResponse = z.infer<typeof publicTournamentLandingResponseSchema>;

export type PublicTournamentJoinResponse = z.infer<typeof publicTournamentJoinResponseSchema>;
