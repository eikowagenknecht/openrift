import type { DeckCheckEntrySource } from "../../deck-check.js";
import type { DeckViolation } from "../../deck-rules.js";
import type { CardType, DeckZone, Domain } from "../enums.js";

export type DeckCheckEventStatus = "active" | "archived";
/**
 * The entry lifecycle (ADR-027): a player edits only in `editable`; `submitted`
 * awaits a judge; `approved` is the pre-event list approval; `checked` is the
 * event-day physical verification; `withdrawn` means the organizer pulled it.
 */
export type DeckCheckEntryState = "editable" | "submitted" | "approved" | "checked" | "withdrawn";
/** How the most recent judge review went; null until a judge reviewed. */
export type DeckCheckReviewOutcome = "ok" | "issue";
/**
 * When a submitted list locks against player changes (TR 401.3, ADR-027):
 * at the moment of submission (strict default), or only once the submission
 * window closes (casual leagues, self-service corrections until then).
 */
export type DeckCheckListLockMode = "on_submit" | "at_deadline";
export type DeckCheckMatchStatus = "matched" | "ambiguous" | "unmatched";
/** How an entry got linked to an OpenRift account (ADR-026). */
export type DeckCheckClaimSource = "email_auto" | "judge_manual" | "self_submit";

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
  /** When a submitted list locks against player changes (ADR-027). */
  listLockMode: DeckCheckListLockMode;
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
  state: DeckCheckEntryState;
  reviewOutcome: DeckCheckReviewOutcome | null;
  checkedByName: string | null;
  checkedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  /** True when the list changed after a judge last reviewed it. */
  changedSinceReview: boolean;
  /** Set when the player asked to unlock an approved entry (ADR-027). */
  unlockRequestedAt: string | null;
  /** Display name of the linked OpenRift account, when one is linked (ADR-026). */
  claimedUserName: string | null;
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
  /** Consent for the organizer to publish the deck list publicly (default true, opt-out). */
  allowDeckPublishing: boolean;
  /** Consent to show the player's name on public platforms (default true, opt-out). */
  allowNameSharing: boolean;
  /** Consent to show the player's Riot ID on public platforms (default true, opt-out). */
  allowRiotIdSharing: boolean;
  submittedAt: string | null;
  state: DeckCheckEntryState;
  reviewOutcome: DeckCheckReviewOutcome | null;
  checkedBy: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  /** Set when the player asked to unlock an approved entry (ADR-027). */
  unlockRequestedAt: string | null;
  notes: string | null;
  changeSummary: DeckCheckChangeSummary | null;
  withdrawnAt: string | null;
  /** Account link (ADR-026); null when no account is linked. */
  claimedUserId: string | null;
  claimedUserName: string | null;
  claimSource: DeckCheckClaimSource | null;
  /** True when a judge unlinked the entry, blocking any further auto-match. */
  claimBlocked: boolean;
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
  /** Entries whose approval or check was invalidated because the list changed. */
  checksInvalidated: number;
  /**
   * @deprecated Always 0 since ADR-027 removed edit-takeover (provider pushes
   * always apply now); kept so existing provider integrations keep parsing.
   */
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
  state: DeckCheckEntryState;
  reviewOutcome: DeckCheckReviewOutcome | null;
  /** True when the player asked to unlock an approved entry (ADR-027). */
  unlockRequested: boolean;
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
    state: DeckCheckEntryState;
    reviewOutcome: DeckCheckReviewOutcome | null;
    /** True when the player asked to unlock an approved entry (ADR-027). */
    unlockRequested: boolean;
    playerMessage: string | null;
    /** The caller's consent for the organizer to publish the deck list publicly. */
    allowDeckPublishing: boolean;
    /** The caller's consent to show their name on public platforms. */
    allowNameSharing: boolean;
    /** The caller's consent to show their Riot ID on public platforms. */
    allowRiotIdSharing: boolean;
    submittedAt: string | null;
    submissionsCloseAt: string | null;
    updatedAt: string;
    /** Whether the submission window is open (event active, deadline not passed). */
    windowOpen: boolean;
    /** Whether the list can be edited right now (state `editable` + open window). */
    canEdit: boolean;
    /** Whether the unlock action unlocks immediately (`at_deadline` mode only). */
    canUnlock: boolean;
    /** Whether the unlock action files a judge request (ADR-027). */
    canRequestUnlock: boolean;
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
    state: DeckCheckEntryState;
    /** Whether submitting through the link can replace this entry's list (ADR-027). */
    canReplace: boolean;
    /** Current sharing consent, so the form starts from the stored answer. */
    allowDeckPublishing: boolean;
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
