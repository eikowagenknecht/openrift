import type { CandidateCardResponse, CandidatePrintingResponse } from "@openrift/shared";
import type { Selectable } from "kysely";

import type { CandidateCardsTable, CandidatePrintingsTable } from "../db/index.js";

/**
 * Pure row → response mappers for the card-submission candidate surface. The
 * response shapes mirror the columns one-for-one apart from the timestamps, so
 * these spread the row and render `checkedAt` as ISO 8601.
 */

export type CandidateCardRow = Pick<
  Selectable<CandidateCardsTable>,
  | "id"
  | "provider"
  | "name"
  | "types"
  | "superTypes"
  | "domains"
  | "might"
  | "energy"
  | "power"
  | "mightBonus"
  | "rulesText"
  | "effectText"
  | "tags"
  | "shortCode"
  | "externalId"
  | "extraData"
  | "checkedAt"
  | "submittedByUserId"
  | "submissionNote"
> & { submittedByName: string | null };

export type CandidatePrintingRow = Pick<
  Selectable<CandidatePrintingsTable>,
  | "id"
  | "candidateCardId"
  | "printingId"
  | "shortCode"
  | "setId"
  | "setName"
  | "rarity"
  | "artVariant"
  | "isSigned"
  | "isOvernumbered"
  | "markerSlugs"
  | "distributionChannelSlugs"
  | "finish"
  | "size"
  | "artist"
  | "publicCode"
  | "printedRulesText"
  | "printedEffectText"
  | "imageUrl"
  | "flavorText"
  | "language"
  | "printedName"
  | "printedYear"
  | "externalId"
  | "extraData"
  | "checkedAt"
>;

/** @returns The candidate card row mapped to its API response shape. */
export function formatCandidateCard(row: CandidateCardRow): CandidateCardResponse {
  return {
    ...row,
    checkedAt: row.checkedAt?.toISOString() ?? null,
  };
}

/** @returns The candidate printing row mapped to its API response shape. */
export function formatCandidatePrinting(row: CandidatePrintingRow): CandidatePrintingResponse {
  return {
    ...row,
    checkedAt: row.checkedAt?.toISOString() ?? null,
  };
}
