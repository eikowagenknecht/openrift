import type {
  deckCheckChangeLineSchema,
  deckCheckChangeSummarySchema,
  deckCheckClaimSourceSchema,
  deckCheckEntryDetailResponseSchema,
  deckCheckEntryResponseSchema,
  deckCheckEntrySummaryResponseSchema,
  deckCheckEventDetailResponseSchema,
  deckCheckEventSummaryResponseSchema,
  deckCheckKeyMintedResponseSchema,
  deckCheckKeyResponseSchema,
  deckCheckKeysResponseSchema,
} from "@openrift/shared/contracts/deck-check";
import type { deckCheckClaimLandingResponseSchema } from "@openrift/shared/contracts/deck-check-claim";
import type {
  deckCheckIngestEntryResultSchema,
  deckCheckIngestResultResponseSchema,
} from "@openrift/shared/contracts/deck-check-ingest";
import type {
  deckCheckClaimResultResponseSchema,
  deckCheckSubmissionPageResponseSchema,
  deckCheckSubmissionResultResponseSchema,
  playerDeckCheckEntryDetailResponseSchema,
} from "@openrift/shared/contracts/deck-check-player";
import type {
  deckCheckEntryCardResponseSchema,
  deckCheckEntryStateSchema,
  deckCheckMatchStatusSchema,
  deckCheckReviewOutcomeSchema,
} from "@openrift/shared/response-schemas";
import type { z } from "zod";

export type DeckCheckEventStatus = z.infer<typeof deckCheckEventSummaryResponseSchema>["status"];
/**
 * The entry lifecycle (ADR-027): a player edits only in `editable`; `submitted`
 * awaits a judge; `approved` is the pre-event list approval; `checked` is the
 * event-day physical verification; `withdrawn` means the organizer pulled it.
 */
export type DeckCheckEntryState = z.infer<typeof deckCheckEntryStateSchema>;
/** How the most recent judge review went; null until a judge reviewed. */
export type DeckCheckReviewOutcome = z.infer<typeof deckCheckReviewOutcomeSchema>;
/**
 * When a submitted list locks against player changes (TR 401.3, ADR-027):
 * at the moment of submission (strict default), or only once the submission
 * window closes (casual leagues, self-service corrections until then).
 */
export type DeckCheckListLockMode = z.infer<
  typeof deckCheckEventSummaryResponseSchema
>["listLockMode"];
export type DeckCheckMatchStatus = z.infer<typeof deckCheckMatchStatusSchema>;
/** How an entry got linked to an OpenRift account (ADR-026). */
export type DeckCheckClaimSource = z.infer<typeof deckCheckClaimSourceSchema>;

/** One normalized card line as it appears in a change summary. */
export type DeckCheckChangeLine = z.infer<typeof deckCheckChangeLineSchema>;

/**
 * Diff between the previously checked list and a re-pushed one, stored so the
 * checker page can show "this list changed since it was checked."
 */
export type DeckCheckChangeSummary = z.infer<typeof deckCheckChangeSummarySchema>;

export type DeckCheckEventSummaryResponse = z.infer<typeof deckCheckEventSummaryResponseSchema>;

export interface DeckCheckEventListResponse {
  items: DeckCheckEventSummaryResponse[];
}

export type DeckCheckEntrySummaryResponse = z.infer<typeof deckCheckEntrySummaryResponseSchema>;

export type DeckCheckEventDetailResponse = z.infer<typeof deckCheckEventDetailResponseSchema>;

export type DeckCheckEntryCardResponse = z.infer<typeof deckCheckEntryCardResponseSchema>;

export type DeckCheckEntryResponse = z.infer<typeof deckCheckEntryResponseSchema>;

/**
 * One card whose type forces a specific zone (Legend / Rune / Battlefield) but
 * that the provider placed elsewhere. Surfaced so a judge can bulk-correct a
 * deck a tool imported with broken zones, while still reviewing each move.
 */
export type ZoneSuggestion = z.infer<
  typeof deckCheckEntryDetailResponseSchema
>["zoneSuggestions"][number];

export type DeckCheckEntryDetailResponse = z.infer<typeof deckCheckEntryDetailResponseSchema>;

export type DeckCheckKeyResponse = z.infer<typeof deckCheckKeyResponseSchema>;

export type DeckCheckKeysResponse = z.infer<typeof deckCheckKeysResponseSchema>;

export type DeckCheckKeyMintedResponse = z.infer<typeof deckCheckKeyMintedResponseSchema>;

/**
 * Per-entry outcome the provider can correlate by its own `externalId` and use
 * to build a "view your deck" link in its confirmation email (ADR-026
 * amendment). No OpenRift account id is exposed; `entryId` is the stable key.
 */
export type DeckCheckIngestEntryResult = z.infer<typeof deckCheckIngestEntryResultSchema>;

export type DeckCheckIngestResultResponse = z.infer<typeof deckCheckIngestResultResponseSchema>;

// ─── Player self-service (ADR-026) ───────────────────────────────────────────

/**
 * The player projection of one entry: a strict subset of the judge payload.
 * Never includes other entrants, `checked_by`, or the judge-private `notes`.
 */
export type PlayerDeckCheckEntryDetailResponse = z.infer<
  typeof playerDeckCheckEntryDetailResponseSchema
>;

/** What a logged-in holder of a submission link sees before submitting. */
export type DeckCheckSubmissionPageResponse = z.infer<typeof deckCheckSubmissionPageResponseSchema>;

/** Dry-run preview / submit result: the resolved lines plus advisory findings. */
export type DeckCheckSubmissionResultResponse = z.infer<
  typeof deckCheckSubmissionResultResponseSchema
>;

// ─── Claim tokens (ADR-026 amendment) ────────────────────────────────────────

/**
 * The pre-claim landing payload: the tournament (and owning group, if any) plus
 * the spot's display name, never the deck, since any holder of the link reaches
 * it before authenticating. Works for tournaments with or without deck check.
 */
export type DeckCheckClaimLandingResponse = z.infer<typeof deckCheckClaimLandingResponseSchema>;

/**
 * The outcome of opening a claim link's POST:
 * - `claimed`: the entry was just linked to the caller.
 * - `already`: it was already linked to the caller (idempotent, e.g. a judge
 *   linked it first); the caller still lands on it.
 * - `conflict`: it is linked to a different account; refused, not stolen.
 * - `blocked`: a judge detached it (`claim_blocked_at`); refused.
 * - `duplicate`: the caller already holds a different spot in this tournament,
 *   so linking this one too would break one-account-per-tournament; refused.
 */
export type DeckCheckClaimStatus = z.infer<typeof deckCheckClaimResultResponseSchema>["status"];

export type DeckCheckClaimResultResponse = z.infer<typeof deckCheckClaimResultResponseSchema>;
