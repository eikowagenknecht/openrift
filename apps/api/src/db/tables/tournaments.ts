import type { DeckCheckCardLine } from "@openrift/shared/deck-check";
import type { PodPenaltyBreakdown } from "@openrift/shared/pairing/types";
import type {
  DeckCheckChangeSummary,
  DeckCheckEntryState,
  DeckCheckMatchStatus,
  DeckCheckReviewOutcome,
} from "@openrift/shared/types/api/deck-check";
import type {
  PodResultStatus,
  PodRoundStatus,
  PodScoringScheme,
} from "@openrift/shared/types/api/pod-tournament";
import type {
  TournamentClaimSource,
  TournamentDeckPhase,
  TournamentDeckSubmission,
  TournamentHostType,
  TournamentListLockMode,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentParticipantStatus,
  TournamentPlayMode,
  TournamentStaffRole,
  TournamentStatus,
} from "@openrift/shared/types/api/tournament";
import type { Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

// Pod pairing state is derived on read: pod_players carries no aggregate
// columns, and there is no pod_opponents table.

export interface TournamentsTable {
  id: Generated<string>;

  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;

  groupId: string | null;

  name: string;
  status: Generated<TournamentStatus>;
  startsAt: Generated<Date>;
  endsAt: Date | null;

  pairingStyle: Generated<TournamentPairingStyle>;
  playMode: Generated<TournamentPlayMode>;
  currentRound: Generated<number>;
  scoringScheme: Generated<PodScoringScheme>;
  byePoints: Generated<number>;
  matchFormat: Generated<TournamentMatchFormat>;
  winPoints: Generated<number>;
  drawPoints: Generated<number>;
  regionsEnabled: Generated<boolean>;

  deckSubmission: Generated<TournamentDeckSubmission>;

  deckPhase: Generated<TournamentDeckPhase>;
  submissionsCloseAt: Date | null;
  listLockMode: Generated<TournamentListLockMode>;
  deckFormat: string | null;
  allowedSets: string[] | null;
  selfRegistration: Generated<boolean>;

  reportToken: string | null;
  followToken: string | null;
  submissionToken: string | null;
  organizerInviteToken: string | null;
  judgeInviteToken: string | null;

  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface TournamentStaffTable {
  tournamentId: string;
  userId: string;
  role: TournamentStaffRole;
  addedAt: CreatedAt;
}

export interface TournamentTeamsTable {
  id: Generated<string>;
  tournamentId: string;
  createdAt: CreatedAt;
}

export interface TournamentParticipantsTable {
  id: Generated<string>;
  tournamentId: string;
  userId: string | null;
  displayName: string;
  riotId: string | null;
  status: Generated<TournamentParticipantStatus>;
  droppedAfterRound: number | null;
  seed: number | null;
  teamId: string | null;
  region: string | null;
  fixedTable: number | null;
  claimSource: TournamentClaimSource | null;
  claimToken: string | null;
  claimedAt: Date | null;
  claimBlockedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PodRoundsTable {
  id: Generated<string>;
  tournamentId: string;
  roundNumber: number;
  status: Generated<PodRoundStatus>;
  penaltyTotal: number;
  pairingStrategy: string;
  createdAt: CreatedAt;
  finalizedAt: Date | null;
}

export interface PodsTable {
  id: Generated<string>;
  roundId: string;
  podNumber: number;
  size: number;
  penaltyBreakdown: PodPenaltyBreakdown;
  resultStatus: Generated<PodResultStatus>;
}

export interface PodMembersTable {
  podId: string;
  playerId: string;
  placement: number | null;
  gamePoints: number | null;
  seat: number | null;
}

export interface PodByesTable {
  roundId: string;
  playerId: string;
}

export interface DeckCheckEntriesTable {
  id: Generated<string>;
  tournamentId: string;
  participantId: string | null;
  externalId: string;
  submittedAt: Date | null;
  allowDeckPublishing: Generated<boolean>;
  allowNameSharing: Generated<boolean>;
  allowRiotIdSharing: Generated<boolean>;
  contentHash: string;
  state: Generated<DeckCheckEntryState>;
  reviewOutcome: DeckCheckReviewOutcome | null;
  checkedBy: string | null;
  checkedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  unlockRequestedAt: Date | null;
  preEditLines: DeckCheckCardLine[] | null;
  notes: string | null;
  changeSummary: DeckCheckChangeSummary | null;
  withdrawnAt: Date | null;
  playerMessage: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckCheckEntryCardsTable {
  id: Generated<string>;
  entryId: string;
  sortOrder: number;
  rawName: string;
  section: string;
  zone: string;
  quantity: number;
  resolvedCardId: string | null;
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
  foundCopies: Generated<(boolean | null)[]>;
}

export interface DeckCheckKeysTable {
  id: Generated<string>;
  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;
  tokenHash: string;
  tokenPrefix: string;
  label: string | null;
  createdBy: string | null;
  createdAt: CreatedAt;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}
