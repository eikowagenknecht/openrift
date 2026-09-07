import type { MetaEventFieldEdits } from "@openrift/shared/types/api/meta";
import type {
  MetaEventOverlayField,
  MetaEventTier,
  MetaEntryStatus,
  MetaListStatus,
  MetaOverlayStatus,
  MetaPlayerOverlayField,
  MetaSubmissionKind,
  MetaSubmissionReason,
  MetaSubmissionStatus,
} from "@openrift/shared/types/enums";
import type { ColumnType, Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface MetaSyncSettingsTable {
  id: number;
  autoAcceptMinPlayers: number | null;
  autoAcceptNotable: Generated<boolean>;
  autoAcceptOfficial: Generated<boolean>;
  competitivePlayerFloor: Generated<number>;
  updatedAt: UpdatedAt;
}

export interface MetaEventsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  /** `date` column: the driver returns it as `"YYYY-MM-DD"` text, not a `Date` (OID 1082 override in `db/connect.ts`). */
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  tier: ColumnType<MetaEventTier, MetaEventTier | undefined, MetaEventTier>;
  country: string | null;
  location: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventPlayersTable {
  id: Generated<string>;
  metaEventId: string;
  rank: number;
  rankIsTier: Generated<boolean>;
  playerName: string | null;
  uvsgamesPlayerId: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendCardId: string | null;
  championCardId: string | null;
  sourceIdentity: string | null;
  mintedByOverlayId: string | null;
  deckId: string | null;
  listStatus: Generated<MetaListStatus>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventMatchesTable {
  id: Generated<string>;
  metaEventId: string;
  sourceMatchId: string | null;
  sourceRoundId: string | null;
  phaseOrder: Generated<number>;
  roundNumber: number;
  tableNumber: number | null;
  isBye: Generated<boolean>;
  isDraw: Generated<boolean>;
  player1Id: string;
  player2Id: string | null;
  winnerId: string | null;
  gamesWonP1: number | null;
  gamesWonP2: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventPhasesTable {
  id: Generated<string>;
  metaEventId: string;
  phaseOrder: number;
  name: string | null;
  roundType: string;
  roundCount: number | null;
  rankRequired: number | null;
  maxGameWins: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventOverlaysTable {
  id: Generated<string>;
  metaEventId: string | null;
  provider: string | null;
  externalId: string | null;
  name: string | null;
  eventDate: string | null;
  format: string | null;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  tier: MetaEventTier | null;
  country: string | null;
  location: string | null;
  claimedFields: MetaEventOverlayField[];
  status: Generated<MetaOverlayStatus>;
  submittedByUserId: string;
  submissionNote: string | null;
  acceptedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventPlayerOverlaysTable {
  id: Generated<string>;
  metaEventPlayerId: string | null;
  metaEventId: string | null;
  eventOverlayId: string | null;
  playerName: string | null;
  rank: number | null;
  rankIsTier: boolean | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendCardId: string | null;
  championCardId: string | null;
  listStatus: MetaListStatus | null;
  provider: string | null;
  sourcePlayerKey: string | null;
  claimedFields: MetaPlayerOverlayField[];
  status: Generated<MetaOverlayStatus>;
  submittedByUserId: string;
  submissionNote: string | null;
  acceptedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventPlayerOverlayCardsTable {
  overlayId: string;
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
  cardId: string | null;
  preferredPrintingId: string | null;
}

export interface MetaEventSourcesTable {
  id: Generated<string>;
  metaEventId: string;
  provider: string | null;
  externalId: string | null;
  label: string;
  sourceUrl: string | null;
  priority: Generated<number>;
  contributes: Generated<boolean>;
  createdAt: CreatedAt;
}

export interface MetaPlayerLinksTable {
  id: Generated<string>;
  metaEventId: string;
  provider: string;
  sourceIdentity: string;
  metaEventPlayerId: string | null;
  createdAt: CreatedAt;
}

export interface MetaCreditsTable {
  id: Generated<string>;
  metaEventId: string;
  metaEventPlayerId: string | null;
  userId: string;
  createdAt: CreatedAt;
}

export interface MetaSubmissionsTable {
  id: Generated<string>;
  userId: string;
  provider: string;
  externalId: string;
  playerOverlayId: string | null;
  metaEventId: string | null;
  eventName: string;
  playerName: string | null;
  kind: Generated<MetaSubmissionKind>;
  fieldEdits: MetaEventFieldEdits | null;
  note: string | null;
  status: Generated<MetaSubmissionStatus>;
  resolutionReason: MetaSubmissionReason | null;
  resolutionNote: string | null;
  resolvedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  resolvedByUserId: string | null;
  acceptedDeckId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}
