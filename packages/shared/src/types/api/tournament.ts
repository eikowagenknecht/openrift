// ADR-033 unified tournaments umbrella. A single entity that composes any subset
// of {a pairing engine, deck submission, deck check, judges} under either a
// personal or an organizational host, optionally linked to a friend group. The
// pod-pairing response shapes live in ./pod-tournament.ts (the pairing module);
// this file carries the umbrella-level enums and the host/staff/participant
// entities the umbrella adds on top.

/** Exactly one of a user or an organization hosts a tournament. */
export type TournamentHostType = "user" | "organization";

/** Lifecycle, orthogonal to the deck phase. `cancelled` locks it read-only. */
export type TournamentStatus = "setup" | "running" | "completed" | "cancelled";

/**
 * The pairing engine. `none` = no rounds or pairings (a roster/schedule-only or
 * deck-only event); `pod` = 3/4-player pod rounds. The single pairing axis; only
 * these ship now, extensible to swiss/cut later.
 */
export type TournamentPairingStyle = "none" | "pod";

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

export interface OrganizationResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMemberResponse {
  userId: string;
  name: string | null;
  role: OrganizationRole;
  joinedAt: string;
}

export interface TournamentStaffMemberResponse {
  userId: string;
  name: string | null;
  role: TournamentStaffRole;
  /** "grant" is an explicit staff row; "organization" is an implicit org owner/manager. */
  source: "grant" | "organization";
  orgRole: OrganizationRole | null;
  addedAt: string;
}

/** The org plus its members (authenticated org page). */
export interface OrganizationDetailResponse extends OrganizationResponse {
  members: OrganizationMemberResponse[];
  /** The caller's role in this org, or null when they are not a member. */
  viewerRole: OrganizationRole | null;
}

/** Admin organization list row: the org with its owner name and member count. */
export interface OrganizationSummaryResponse extends OrganizationResponse {
  ownerName: string | null;
  memberCount: number;
}

export interface OrganizationListResponse {
  items: OrganizationSummaryResponse[];
}

/** The caller's relationship to a tournament. */
export type TournamentViewerRole = "host" | "organizer" | "judge" | "participant";

/** The polymorphic host resolved to a display name (and org slug, if an org host). */
export interface TournamentHostInfo {
  type: TournamentHostType;
  userId: string | null;
  orgId: string | null;
  displayName: string;
  orgSlug: string | null;
}

/** Which capability modules are switched on for a tournament. */
export interface TournamentModuleFlags {
  pairing: boolean;
  deckSubmission: boolean;
}

export interface TournamentSummaryResponse {
  id: string;
  name: string;
  status: TournamentStatus;
  host: TournamentHostInfo;
  groupId: string | null;
  groupSlug: string | null;
  groupName: string | null;
  pairingStyle: TournamentPairingStyle;
  deckSubmission: TournamentDeckSubmission;
  /** Deck legality format slug (e.g. `"standard"`), or null for no legality checks. */
  deckFormat: string | null;
  startsAt: string;
  endsAt: string | null;
  modules: TournamentModuleFlags;
  participantCount: number;
  pendingRequestCount: number;
  myRoles: TournamentViewerRole[];
  createdAt: string;
  updatedAt: string;
}

export interface TournamentListResponse {
  items: TournamentSummaryResponse[];
}

export interface TournamentDetailResponse extends TournamentSummaryResponse {
  currentRound: number;
  scoringScheme: "standard" | "three_pod_reduced";
  byePoints: number;
  deckPhase: TournamentDeckPhase;
  submissionsCloseAt: string | null;
  listLockMode: TournamentListLockMode;
  allowedSets: string[] | null;
  selfRegistration: boolean;
  reportToken: string | null;
  followToken: string | null;
  submissionToken: string | null;
  /** Reusable staff-invite link granting `organizer`, or null when not enabled. */
  organizerInviteToken: string | null;
  /** Reusable staff-invite link granting `judge`, or null when not enabled. */
  judgeInviteToken: string | null;
  staff: TournamentStaffMemberResponse[];
  /** True once any round exists; the pairing engine can no longer be changed. */
  hasRounds: boolean;
}

/**
 * Someone a host can grant staff to without typing an email: a member of the
 * linked friend group, or an account-linked participant. `source` says which.
 */
export interface TournamentStaffCandidateResponse {
  userId: string;
  name: string | null;
  source: "group" | "participant";
}

export interface TournamentStaffCandidateListResponse {
  items: TournamentStaffCandidateResponse[];
}

/** Token landing for a staff-invite link (the confirm-to-join staff surface). */
export interface TournamentStaffInviteLandingResponse {
  name: string;
  hostDisplayName: string;
  role: TournamentStaffRole;
  /** True when the caller already holds this (or a higher) staff role. */
  alreadyStaff: boolean;
}

export interface TournamentParticipantResponse {
  id: string;
  userId: string | null;
  userName: string | null;
  displayName: string;
  riotId: string | null;
  status: TournamentParticipantStatus;
  seed: number | null;
  droppedAfterRound: number | null;
  /** The claim-link capability token, or null once the spot is claimed or blocked. */
  claimToken: string | null;
  /** A judge unlinked a wrong account; the spot is blocked until a re-issue. */
  claimBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentParticipantListResponse {
  items: TournamentParticipantResponse[];
}

/** Token landing for a self-registration / submission link (no auth required). */
export interface PublicTournamentLandingResponse {
  name: string;
  hostDisplayName: string;
  selfRegistrationOpen: boolean;
  /** Whether a deck is expected (deck_submission is optional or required). */
  deckExpected: boolean;
  /**
   * True when the signed-in viewer already holds a spot here. When
   * self-registration is closed, only a claimed participant may submit a deck
   * through the link; a stranger must claim their spot first. Always false for
   * an anonymous viewer.
   */
  viewerIsParticipant: boolean;
}

/** Result of an authenticated request-to-join via the submission token. */
export interface PublicTournamentJoinResponse {
  participantId: string;
  status: TournamentParticipantStatus;
  /** True when the caller already had a participant in this tournament. */
  alreadyJoined: boolean;
}
