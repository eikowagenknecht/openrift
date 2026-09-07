import type {
  MetaEventTier,
  MetaEntryStatus,
  MetaSourceFetchStatus,
} from "@openrift/shared/types/enums";
import type { Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface UvsgamesEventsTable {
  externalId: string;
  name: string;
  startAt: Date;
  endAtEstimate: Date | null;
  displayStatus: string;
  decklistStatus: string | null;
  playerCount: number | null;
  eventType: string | null;
  eventFormat: string | null;
  storeId: number | null;
  storeName: string | null;
  location: string | null;
  timezone: string | null;
  contentHash: string;
  firstSeenAt: Generated<Date>;
  lastSeenAt: Date;
  missingSince: Date | null;
  eventConfigurationTemplate: string | null;
  resultsFetchedAt: Date | null;
}

export interface UvsgamesEventTemplatesTable {
  templateId: string;
  sourceName: string | null;
  watched: Generated<boolean>;
  tier: MetaEventTier | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UvsgamesFormatMappingsTable {
  sourceFormat: string;
  mappedFormat: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UvsgamesStoresTable {
  id: number;
  name: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UvsgamesPlayersTable {
  id: number;
  displayName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Riftbound ids are deliberately absent here; they land in `uvsgames_events` instead. */
export interface UvsgamesIdProbesTable {
  externalId: number;
  outcome: string;
  gameType: string | null;
  probedAt: Generated<Date>;
}

export interface UvsgamesEventChecksTable {
  externalId: string;
  nextCheckAt: Date | null;
  checkStage: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PlayloltcgShopsTable {
  id: number;
  name: string;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PlayloltcgEventsTable {
  activityShopId: number;
  shopId: number | null;
  shopName: string | null;
  name: string;
  activityType: string | null;
  activityTypeName: string | null;
  battleMode: string | null;
  status: number | null;
  /** `date` column: the driver returns it as `"YYYY-MM-DD"` text, not a `Date` (OID 1082 override in `db/connect.ts`). */
  startAt: string | null;
  endAt: string | null;
  playerCount: number | null;
  maxUser: number | null;
  fee: number | null;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  contentHash: string;
  firstSeenAt: Generated<Date>;
  lastSeenAt: Date;
  missingSince: Date | null;
}

export interface PlayloltcgEventChecksTable {
  activityShopId: number;
  nextCheckAt: Date | null;
  checkStage: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UvsgamesEventStandingsTable {
  externalId: string;
  registrationId: string;
  uvsgamesPlayerId: number | null;
  playerName: string | null;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendName: string | null;
  sourceDeckId: string | null;
  fetchedAt: CreatedAt;
}

export interface UvsgamesEventPhasesTable {
  externalId: string;
  phaseOrder: number;
  name: string | null;
  roundType: string;
  roundCount: number | null;
  rankRequired: number | null;
  maxGameWins: number | null;
}

export interface UvsgamesEventMatchesTable {
  externalId: string;
  roundId: string;
  sourceMatchId: string;
  phaseOrder: Generated<number>;
  roundNumber: number;
  tableNumber: number | null;
  isBye: Generated<boolean>;
  isDraw: Generated<boolean>;
  player1UvsgamesId: number;
  player2UvsgamesId: number | null;
  winnerUvsgamesId: number | null;
  gamesWonP1: number | null;
  gamesWonP2: number | null;
}

export interface UvsgamesDecklistsTable {
  sourceDeckId: string;
  externalId: string;
  fetchStatus: MetaSourceFetchStatus;
  fetchedAt: CreatedAt;
}

export interface UvsgamesDecklistCardsTable {
  sourceDeckId: string;
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
}

export interface PlayloltcgEventStandingsTable {
  activityShopId: number;
  playerKey: string;
  sourceUserId: number | null;
  playerName: string;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendName: string | null;
  sourceDeckId: string | null;
  fetchedAt: CreatedAt;
}

export interface PlayloltcgDecklistsTable {
  sourceDeckId: string;
  activityShopId: number;
  fetchStatus: MetaSourceFetchStatus;
  fetchedAt: CreatedAt;
}

export interface PlayloltcgDecklistCardsTable {
  sourceDeckId: string;
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
}

export interface TopdeckEventsTable {
  tid: string;
  name: string;
  format: string;
  startAt: Date;
  swissRounds: number | null;
  topCut: number | null;
  playerCount: number | null;
  isTeamEvent: Generated<boolean>;
  teamSize: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  contentHash: string;
  firstSeenAt: Generated<Date>;
  lastSeenAt: Date;
  missingSince: Date | null;
}

export interface TopdeckEventStandingsTable {
  tid: string;
  playerKey: string;
  sourcePlayerId: string | null;
  playerName: string;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendName: string | null;
  sourceDeckId: string | null;
  fetchedAt: CreatedAt;
}

export interface TopdeckDecklistsTable {
  sourceDeckId: string;
  tid: string;
  fetchStatus: MetaSourceFetchStatus;
  fetchedAt: CreatedAt;
}

export interface TopdeckDecklistCardsTable {
  sourceDeckId: string;
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
}

export interface IgnoredMetaSourceEventsTable {
  provider: string;
  externalId: string;
  createdAt: CreatedAt;
}

export interface IgnoredMetaSourcePlayersTable {
  provider: string;
  eventExternalId: string;
  externalId: string;
  createdAt: CreatedAt;
}
