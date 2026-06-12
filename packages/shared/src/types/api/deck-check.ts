import type { DeckCheckEntrySource } from "../../deck-check.js";
import type { DeckViolation } from "../../deck-rules.js";
import type { CardType, DeckZone, Domain } from "../enums.js";

export type DeckCheckEventStatus = "active" | "archived";
export type DeckCheckEntryStatus = "unchecked" | "checked" | "issue";
export type DeckCheckMatchStatus = "matched" | "ambiguous" | "unmatched";
/** How an entry got linked to an OpenRift account (ADR-026). */
export type DeckCheckClaimSource = "email_auto" | "judge_manual" | "self_submit";
/** Who owns an entry's card list: the provider feed, or the player after edit-takeover. */
export type DeckCheckListOwner = "provider" | "player";

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
  /** Per-event opt-in for player self-submission (ADR-026). */
  allowSelfSubmission: boolean;
  /** Shared submission capability; only present while self-submission is on. */
  submissionToken: string | null;
  submissionsCloseAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCheckEventListResponse {
  items: DeckCheckEventSummaryResponse[];
}

export interface DeckCheckEntrySummaryResponse {
  id: string;
  externalId: string;
  /** Whether the entry came from an organizer push or was hand-entered. */
  source: DeckCheckEntrySource;
  playerName: string;
  submittedAt: string | null;
  checkStatus: DeckCheckEntryStatus;
  checkedByName: string | null;
  checkedAt: string | null;
  /** True when the list changed after it was last checked. */
  changedSinceCheck: boolean;
  withdrawn: boolean;
  /** Display name of the linked OpenRift account, when one is linked (ADR-026). */
  claimedUserName: string | null;
  listOwner: DeckCheckListOwner;
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
  /** Whether the entry came from an organizer push or was hand-entered. */
  source: DeckCheckEntrySource;
  playerName: string;
  playerEmail: string | null;
  riotId: string | null;
  /** Consent to show the player's name on public platforms (default true, opt-out). */
  allowNameSharing: boolean;
  /** Consent to show the player's Riot ID on public platforms (default true, opt-out). */
  allowRiotIdSharing: boolean;
  submittedAt: string | null;
  checkStatus: DeckCheckEntryStatus;
  checkedBy: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
  notes: string | null;
  changeSummary: DeckCheckChangeSummary | null;
  withdrawnAt: string | null;
  /** Account link (ADR-026); null when no account is linked. */
  claimedUserId: string | null;
  claimedUserName: string | null;
  claimSource: DeckCheckClaimSource | null;
  /** True when a judge unlinked the entry, blocking any further auto-match. */
  claimBlocked: boolean;
  listOwner: DeckCheckListOwner;
  /** Set when a provider push was ignored because the player owns the list. */
  providerPushIgnoredAt: string | null;
  /** Judge-authored message shown to the linked player, separate from `notes`. */
  playerMessage: string | null;
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
  /** Pushes ignored because the player took over the entry's list (ADR-026). */
  entriesIgnored: number;
}

// ─── Player self-service (ADR-026) ───────────────────────────────────────────

/** One row of the player's "My tournament decks" list. */
export interface PlayerDeckCheckEntrySummaryResponse {
  id: string;
  eventName: string;
  eventDate: string | null;
  groupName: string;
  /** The owning group's slug, so group pages can show the viewer's own entries. */
  groupSlug: string;
  checkStatus: DeckCheckEntryStatus;
  /** True when the list changed after it was last checked. */
  changedSinceCheck: boolean;
  withdrawn: boolean;
  playerMessage: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface PlayerDeckCheckEntriesResponse {
  items: PlayerDeckCheckEntrySummaryResponse[];
}

/**
 * The player projection of one entry: a strict subset of the judge payload.
 * Never includes other entrants, `checked_by`, or the judge-private `notes`.
 */
export interface PlayerDeckCheckEntryDetailResponse {
  entry: {
    id: string;
    eventName: string;
    eventDate: string | null;
    groupName: string;
    format: string | null;
    allowedSets: string[] | null;
    checkStatus: DeckCheckEntryStatus;
    changedSinceCheck: boolean;
    withdrawn: boolean;
    playerMessage: string | null;
    listOwner: DeckCheckListOwner;
    /** The caller's consent to show their name on public platforms. */
    allowNameSharing: boolean;
    /** The caller's consent to show their Riot ID on public platforms. */
    allowRiotIdSharing: boolean;
    submittedAt: string | null;
    updatedAt: string;
    /** Whether the entry can currently be edited (event open, not withdrawn). */
    canEdit: boolean;
  };
  cards: DeckCheckEntryCardResponse[];
  violations: DeckViolation[];
  typeCounts: { cardType: CardType; count: number }[];
  domainDistribution: { domain: Domain; count: number }[];
}

/** What a logged-in holder of a submission link sees before submitting. */
export interface DeckCheckSubmissionPageResponse {
  eventName: string;
  eventDate: string | null;
  groupName: string;
  format: string | null;
  allowedSets: string[] | null;
  submissionsCloseAt: string | null;
  /** False once the window closed or the event was archived. */
  submissionsOpen: boolean;
  /** The caller's already-linked entry in this event, if any. */
  linkedEntry: {
    id: string;
    checkStatus: DeckCheckEntryStatus;
    withdrawn: boolean;
    /** Current sharing consent, so the form starts from the stored answer. */
    allowNameSharing: boolean;
    allowRiotIdSharing: boolean;
  } | null;
}

/** Dry-run preview / submit result: the resolved lines plus advisory findings. */
export interface DeckCheckSubmissionResultResponse {
  /** Null on a dry run; the entry id otherwise. */
  entryId: string | null;
  cards: DeckCheckEntryCardResponse[];
  violations: DeckViolation[];
}

/** One account candidate for the judge link search. */
export interface DeckCheckAccountSearchResponse {
  items: { id: string; name: string | null; email: string }[];
}
