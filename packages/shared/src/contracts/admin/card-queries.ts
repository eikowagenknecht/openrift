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
  // Lets the admin card pickers match a typed printing code, the same as the
  // catalog-backed pickers. No images, so the rows stay text-only.
  shortCodes: z.array(z.string()),
});

export const providerStatsItemSchema = z.object({
  provider: z.string(),
  cardCount: z.number(),
  printingCount: z.number(),
  lastUpdated: z.string(),
});

// Mirror of the API-side `candidateCardSummarySchema` (apps/api cards/schemas).
// Duplicated here because contracts live in the shared package and cannot
// import from apps/api; kept in sync with `CandidateCardSummaryResponse`.
export const candidateCardSummarySchema = z.object({
  cardSlug: z.string().nullable(),
  name: z.string(),
  normalizedName: z.string(),
  shortCodes: z.array(z.string()),
  stagingShortCodes: z.array(z.string()),
  // Distinct set slugs across the row's printings — accepted printings and
  // pending candidate printings alike — so the admin set filter narrows both
  // the Cards and Candidates tabs (a new-set candidate has no accepted printing
  // yet, so accepted-only setSlugs would hide it).
  setSlugs: z.array(z.string()),
  candidateCount: z.number(),
  uncheckedCardCount: z.number(),
  uncheckedPrintingCount: z.number(),
  // Candidate printings not yet linked to an accepted printing, across every
  // provider and regardless of `checkedAt` — exactly the rows the card detail
  // page shows as "New:" groups. Wider than `favoriteStagingShortCodes`, which
  // is favorites-and-unchecked only, so the list page can filter on the same
  // population the detail page highlights.
  unlinkedPrintingCount: z.number(),
  hasFavorite: z.boolean(),
  favoriteStagingShortCodes: z.array(z.string()),
  suggestedCardSlug: z.string().nullable(),
  // ADR-036: true when any candidate in this group came from an in-app user
  // submission (provider "usersubmission"). Drives the admin badge + filter.
  hasUserSubmission: z.boolean(),
});

/**
 * oRPC contract for the read-only admin card queries (mounted under
 * `/api/admin/v1/cards`, admin-gated by the mount). The two detail endpoints
 * and the export return loosely-typed payloads (`z.unknown()`) — the API maps
 * them to the rich hand-written response interfaces, which the web client
 * re-points to directly. No domain control-flow errors are declared; the only
 * `AppError` that can emerge (`MISSING_ALIAS`, a server fault) stays undefined.
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
