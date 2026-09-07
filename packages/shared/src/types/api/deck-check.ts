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
 * A player edits only in `editable`; `submitted` awaits a judge; `approved` is
 * the pre-event list approval; `checked` is the event-day physical verification.
 */
export type DeckCheckEntryState = z.infer<typeof deckCheckEntryStateSchema>;
/** Null until a judge reviewed. */
export type DeckCheckReviewOutcome = z.infer<typeof deckCheckReviewOutcomeSchema>;
/**
 * When a submitted list locks against player changes (TR 401.3): at the
 * moment of submission (strict default), or only once the submission window closes.
 */
export type DeckCheckListLockMode = z.infer<
  typeof deckCheckEventSummaryResponseSchema
>["listLockMode"];
export type DeckCheckMatchStatus = z.infer<typeof deckCheckMatchStatusSchema>;
export type DeckCheckClaimSource = z.infer<typeof deckCheckClaimSourceSchema>;

export type DeckCheckChangeLine = z.infer<typeof deckCheckChangeLineSchema>;

export type DeckCheckChangeSummary = z.infer<typeof deckCheckChangeSummarySchema>;

export type DeckCheckEventSummaryResponse = z.infer<typeof deckCheckEventSummaryResponseSchema>;

export interface DeckCheckEventListResponse {
  items: DeckCheckEventSummaryResponse[];
}

export type DeckCheckEntrySummaryResponse = z.infer<typeof deckCheckEntrySummaryResponseSchema>;

export type DeckCheckEventDetailResponse = z.infer<typeof deckCheckEventDetailResponseSchema>;

export type DeckCheckEntryCardResponse = z.infer<typeof deckCheckEntryCardResponseSchema>;

export type DeckCheckEntryResponse = z.infer<typeof deckCheckEntryResponseSchema>;

/** A card whose type forces a specific zone (Legend / Rune / Battlefield) but that the provider placed elsewhere. */
export type ZoneSuggestion = z.infer<
  typeof deckCheckEntryDetailResponseSchema
>["zoneSuggestions"][number];

export type DeckCheckEntryDetailResponse = z.infer<typeof deckCheckEntryDetailResponseSchema>;

export type DeckCheckKeyResponse = z.infer<typeof deckCheckKeyResponseSchema>;

export type DeckCheckKeysResponse = z.infer<typeof deckCheckKeysResponseSchema>;

export type DeckCheckKeyMintedResponse = z.infer<typeof deckCheckKeyMintedResponseSchema>;

/** Correlated by the provider's own `externalId`; no OpenRift account id is exposed. */
export type DeckCheckIngestEntryResult = z.infer<typeof deckCheckIngestEntryResultSchema>;

export type DeckCheckIngestResultResponse = z.infer<typeof deckCheckIngestResultResponseSchema>;

/** A strict subset of the judge payload: never other entrants, `checked_by`, or `notes`. */
export type PlayerDeckCheckEntryDetailResponse = z.infer<
  typeof playerDeckCheckEntryDetailResponseSchema
>;

export type DeckCheckSubmissionPageResponse = z.infer<typeof deckCheckSubmissionPageResponseSchema>;

export type DeckCheckSubmissionResultResponse = z.infer<
  typeof deckCheckSubmissionResultResponseSchema
>;

/** Never the deck: any holder of the link reaches this before authenticating. */
export type DeckCheckClaimLandingResponse = z.infer<typeof deckCheckClaimLandingResponseSchema>;

/**
 * `already` is idempotent (e.g. a judge already linked it); `conflict`,
 * `blocked`, and `duplicate` are all refusals, not the entry being stolen.
 */
export type DeckCheckClaimStatus = z.infer<typeof deckCheckClaimResultResponseSchema>["status"];

export type DeckCheckClaimResultResponse = z.infer<typeof deckCheckClaimResultResponseSchema>;
