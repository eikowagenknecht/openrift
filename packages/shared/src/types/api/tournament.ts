// ADR-033 unified tournaments umbrella. A single entity that composes any subset
// of {a pairing engine, deck submission, deck check, judges} under either a
// personal or an organizational host, optionally linked to a friend group. The
// pod-pairing response shapes live in ./pod-tournament.ts (the pairing module);
// this file carries the umbrella-level enums and the host/staff/participant
// entities the umbrella adds on top.

import type {
  organizationDetailResponseSchema,
  organizationListResponseSchema,
  organizationMemberResponseSchema,
  organizationResponseSchema,
  organizationSummaryResponseSchema,
} from "@openrift/shared/contracts/organizations";
import type {
  publicTournamentJoinResponseSchema,
  publicTournamentLandingResponseSchema,
  tournamentStaffInviteLandingResponseSchema,
} from "@openrift/shared/contracts/public-tournaments";
import type {
  tournamentCoverLegendSchema,
  tournamentDetailResponseSchema,
  tournamentHostInfoSchema,
  tournamentListResponseSchema,
  tournamentModuleFlagsSchema,
  tournamentMyDeckEntrySchema,
  tournamentParticipantListResponseSchema,
  tournamentParticipantPreviewSchema,
  tournamentParticipantResponseSchema,
  tournamentStaffCandidateListResponseSchema,
  tournamentStaffCandidateResponseSchema,
  tournamentStaffMemberResponseSchema,
  tournamentSummaryResponseSchema,
  tournamentWinnerSchema,
} from "@openrift/shared/contracts/tournaments";
import type { z } from "zod";

/** Exactly one of a user or an organization hosts a tournament. */
export type TournamentHostType = "user" | "organization";

/** Lifecycle, orthogonal to the deck phase. `cancelled` locks it read-only. */
export type TournamentStatus = "setup" | "running" | "completed" | "cancelled";

/**
 * The pairing engine. `none` = no rounds or pairings (a roster/schedule-only or
 * deck-only event); `pod` = 3/4-player pod rounds; `swiss` = 1v1 Swiss matches.
 * The single pairing axis, extensible to cut later.
 */
export type TournamentPairingStyle = "none" | "pod" | "swiss";

/**
 * The play mode, orthogonal to the pairing style. `2v2` composes with `swiss`
 * (team Swiss: fixed teams of two, each match a size-4 pod holding two teams)
 * and with `none` (deck-only events checked against the 2v2 banlist); it is
 * rejected with `pod` and with the region layer.
 */
export type TournamentPlayMode = "1v1" | "2v2";

/** Swiss result entry: best of 1 or best of 3. Only meaningful for `swiss`. */
export type TournamentMatchFormat = "bo1" | "bo3";

/**
 * Whether a decklist is expected. Every submission produces a deck-check entry, so
 * a tournament that collects lists (`optional`/`required`) is checkable by judges;
 * there is no separate "enable checking" switch.
 */
export type TournamentDeckSubmission = "none" | "optional" | "required";

/** Deck-submission sub-state, orthogonal to {@link TournamentStatus}. */
export type TournamentDeckPhase = "open" | "closed" | "locked";

/** When a submitted list locks: on submit, or only at the submission deadline. */
export type TournamentListLockMode = "on_submit" | "at_deadline";

/** Per-tournament staff grant, decoupled from friend-group roles. */
export type TournamentStaffRole = "organizer" | "judge";

/**
 * Organization membership. `owner`/`manager` inherit organizer authority on every
 * tournament the org hosts; `judge` inherits judge authority only (deck check, no
 * management) and has no org-admin access.
 */
export type OrganizationRole = "owner" | "manager" | "judge";

/** Participant lifecycle: walk-in/invited/self-requested → active → dropped/no-show. */
export type TournamentParticipantStatus =
  | "requested"
  | "invited"
  | "active"
  | "dropped"
  | "no_show";

/** How a participant's account link was established. */
export type TournamentClaimSource = "judge_manual" | "self_submit" | "claim_link";

export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

export type OrganizationMemberResponse = z.infer<typeof organizationMemberResponseSchema>;

export type TournamentStaffMemberResponse = z.infer<typeof tournamentStaffMemberResponseSchema>;

/** The org plus its members (authenticated org page). */
export type OrganizationDetailResponse = z.infer<typeof organizationDetailResponseSchema>;

/** Admin organization list row: the org with its owner name and member count. */
export type OrganizationSummaryResponse = z.infer<typeof organizationSummaryResponseSchema>;

export type OrganizationListResponse = z.infer<typeof organizationListResponseSchema>;

/** The caller's relationship to a tournament. */
export type TournamentViewerRole = "host" | "organizer" | "judge" | "participant";

/** The polymorphic host resolved to a display name (and org slug, if an org host). */
export type TournamentHostInfo = z.infer<typeof tournamentHostInfoSchema>;

/** Which capability modules are switched on for a tournament. */
export type TournamentModuleFlags = z.infer<typeof tournamentModuleFlagsSchema>;

/** One participant in the summary facepile preview. */
export type TournamentParticipantPreview = z.infer<typeof tournamentParticipantPreviewSchema>;

/** The standings leader of a completed tournament. */
export type TournamentWinner = z.infer<typeof tournamentWinnerSchema>;

/** One legend art for the hero card fan. */
export type TournamentCoverLegend = z.infer<typeof tournamentCoverLegendSchema>;

/** The viewer's own deck entry on a tournament, as the dashboard sees it. */
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

/** Token landing for a staff-invite link (the confirm-to-join staff surface). */
export type TournamentStaffInviteLandingResponse = z.infer<
  typeof tournamentStaffInviteLandingResponseSchema
>;

export type TournamentParticipantResponse = z.infer<typeof tournamentParticipantResponseSchema>;

export type TournamentParticipantListResponse = z.infer<
  typeof tournamentParticipantListResponseSchema
>;

/** Token landing for a self-registration / submission link (no auth required). */
export type PublicTournamentLandingResponse = z.infer<typeof publicTournamentLandingResponseSchema>;

/** Result of an authenticated request-to-join via the submission token. */
export type PublicTournamentJoinResponse = z.infer<typeof publicTournamentJoinResponseSchema>;
