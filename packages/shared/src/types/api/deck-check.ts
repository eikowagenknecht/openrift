import type { DeckViolation } from "../../deck-rules.js";
import type { CardType, DeckZone, Domain } from "../enums.js";

export type DeckCheckEventStatus = "active" | "archived";
export type DeckCheckEntryStatus = "unchecked" | "checked" | "issue";
export type DeckCheckMatchStatus = "matched" | "ambiguous" | "unmatched";

/** One normalized card line as it appears in a change summary. */
export interface DeckCheckChangeLine {
  name: string;
  zone: string;
  quantity: number;
}

/**
 * Diff between the previously checked list and a re-pushed one, stored so the
 * checker page can show "this list changed since it was checked."
 */
export interface DeckCheckChangeSummary {
  added: DeckCheckChangeLine[];
  removed: DeckCheckChangeLine[];
  changed: { name: string; zone: string; oldQuantity: number; newQuantity: number }[];
}

export interface DeckCheckEventSummaryResponse {
  id: string;
  name: string;
  eventDate: string | null;
  format: string | null;
  allowedSets: string[] | null;
  status: DeckCheckEventStatus;
  entryCount: number;
  checkedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCheckEventListResponse {
  items: DeckCheckEventSummaryResponse[];
}

export interface DeckCheckEntrySummaryResponse {
  id: string;
  externalId: string;
  playerName: string;
  submittedAt: string | null;
  checkStatus: DeckCheckEntryStatus;
  checkedByName: string | null;
  checkedAt: string | null;
  /** True when the list changed after it was last checked. */
  changedSinceCheck: boolean;
  withdrawn: boolean;
  /** Physical copies (summed quantities). */
  copyCount: number;
  verifiedCopyCount: number;
  unmatchedLineCount: number;
}

export interface DeckCheckEventDetailResponse {
  event: DeckCheckEventSummaryResponse;
  entries: DeckCheckEntrySummaryResponse[];
}

export interface DeckCheckEntryCardResponse {
  id: string;
  sortOrder: number;
  rawName: string;
  section: string;
  zone: DeckZone;
  quantity: number;
  matchStatus: DeckCheckMatchStatus;
  /** One flag per physical copy (length == quantity): has the judge found it. */
  foundCopies: boolean[];
  resolvedCardId: string | null;
  /** The client resolves the thumbnail from its loaded catalogue. */
  resolvedPrintingId: string | null;
}

export interface DeckCheckEntryResponse {
  id: string;
  externalId: string;
  playerName: string;
  playerEmail: string | null;
  playerHandle: string | null;
  submittedAt: string | null;
  checkStatus: DeckCheckEntryStatus;
  checkedBy: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
  notes: string | null;
  changeSummary: DeckCheckChangeSummary | null;
  withdrawnAt: string | null;
  updatedAt: string;
}

export interface DeckCheckEntryDetailResponse {
  event: DeckCheckEventSummaryResponse;
  entry: DeckCheckEntryResponse;
  cards: DeckCheckEntryCardResponse[];
  /** Existing deck-rules violations plus out-of-allowed-sets findings; advisory only. */
  violations: DeckViolation[];
  typeCounts: { cardType: CardType; count: number }[];
  domainDistribution: { domain: Domain; count: number }[];
}

export interface DeckCheckKeyResponse {
  id: string;
  tokenPrefix: string;
  label: string | null;
  createdByName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface DeckCheckKeysResponse {
  items: DeckCheckKeyResponse[];
}

export interface DeckCheckKeyMintedResponse {
  key: DeckCheckKeyResponse;
  /** Plaintext token, returned exactly once at mint time. */
  token: string;
}

export interface DeckCheckIngestResultResponse {
  eventId: string;
  entriesCreated: number;
  entriesUpdated: number;
  entriesUnchanged: number;
  entriesWithdrawn: number;
  /** Entries whose check was invalidated because the list changed. */
  checksInvalidated: number;
}
