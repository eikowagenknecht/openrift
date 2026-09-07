import { z } from "zod";

import { authedRoute } from "../_base.js";
import {
  adminCardDetailResponseSchema,
  unmatchedCardDetailResponseSchema,
} from "./card-detail-schemas.js";
import { candidateExportDocumentSchema } from "./card-mutations.js";

const TAG = "Admin - Cards";

const CARDS = "/api/admin/v1/cards";

const allCardsItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  types: z.array(z.string()),
  setSlugs: z.array(z.string()),
  shortCodes: z.array(z.string()),
});

export const providerStatsItemSchema = z.object({
  provider: z.string(),
  cardCount: z.number(),
  printingCount: z.number(),
  lastUpdated: z.string(),
});

// Duplicated from the API-side `candidateCardSummarySchema`; contracts live in
// the shared package and cannot import from apps/api.
export const candidateCardSummarySchema = z.object({
  cardSlug: z.string().nullable(),
  name: z.string(),
  normalizedName: z.string(),
  shortCodes: z.array(z.string()),
  stagingShortCodes: z.array(z.string()),
  setSlugs: z.array(z.string()),
  candidateCount: z.number(),
  uncheckedCardCount: z.number(),
  uncheckedPrintingCount: z.number(),
  unlinkedPrintingCount: z.number(),
  hasFavorite: z.boolean(),
  favoriteStagingShortCodes: z.array(z.string()),
  suggestedCardSlug: z.string().nullable(),
  hasUserSubmission: z.boolean(),
});

/**
 * The two detail endpoints and the export return loosely-typed payloads
 * (`z.unknown()`); the API maps them to the rich hand-written response
 * interfaces the web client re-points to directly.
 */
export const adminCardQueriesContract = {
  allCards: authedRoute
    .route({ method: "GET", path: `${CARDS}/all-cards`, tags: [TAG] })
    .output(z.array(allCardsItemSchema)),
  providerNames: authedRoute
    .route({ method: "GET", path: `${CARDS}/provider-names`, tags: [TAG] })
    .output(z.array(z.string())),
  distinctArtists: authedRoute
    .route({ method: "GET", path: `${CARDS}/distinct-artists`, tags: [TAG] })
    .output(z.array(z.string())),
  providerStats: authedRoute
    .route({ method: "GET", path: `${CARDS}/provider-stats`, tags: [TAG] })
    .output(z.array(providerStatsItemSchema)),
  listCandidates: authedRoute
    .route({ method: "GET", path: CARDS, tags: [TAG] })
    .output(z.array(candidateCardSummarySchema)),
  exportCandidates: authedRoute
    .route({ method: "GET", path: `${CARDS}/export`, tags: [TAG] })
    .output(candidateExportDocumentSchema),
  getCandidateCard: authedRoute
    .route({ method: "GET", path: `${CARDS}/{cardSlug}`, tags: [TAG] })
    .input(z.object({ cardSlug: z.string() }))
    .output(adminCardDetailResponseSchema),
  getUnmatchedDetail: authedRoute
    .route({ method: "GET", path: `${CARDS}/new/{name}`, tags: [TAG] })
    .input(z.object({ name: z.string() }))
    .output(unmatchedCardDetailResponseSchema),
};

export type AdminCardQueriesContract = typeof adminCardQueriesContract;
export type AllCardsResponse = z.infer<typeof allCardsItemSchema>[];
