import type { z } from "zod";

import type {
  adminCardDetailResponseSchema,
  adminCardResponseSchema,
  adminPrintingDistributionChannelResponseSchema,
  adminPrintingImageResponseSchema,
  adminPrintingMarketplaceMappingResponseSchema,
  adminPrintingResponseSchema,
  candidateCardResponseSchema,
  candidatePrintingGroupResponseSchema,
  candidatePrintingResponseSchema,
  unmatchedCardDetailResponseSchema,
} from "../../contracts/admin/card-detail-schemas.js";
import type { uploadCandidatesResponseSchema } from "../../contracts/admin/card-mutations.js";
import type {
  candidateCardSummarySchema,
  providerStatsItemSchema,
} from "../../contracts/admin/card-queries.js";
import type {
  adminCardTagListResponseSchema,
  adminTagCategoryListResponseSchema,
  classifiedCardTagSchema,
  tagCategoryResponseSchema,
} from "../../contracts/admin/card-tags.js";
import type { adminSetSchema } from "../../contracts/admin/catalog.js";
import type {
  adminCustomTagAssignmentsResponseSchema,
  adminCustomTagCategoryListResponseSchema,
  adminCustomTagListResponseSchema,
  customTagCategorySchema,
  customTagSchema,
} from "../../contracts/admin/custom-tags.js";
import type { channelSchema } from "../../contracts/admin/distribution-channels.js";
import type { flagSchema } from "../../contracts/admin/feature-flags.js";
import type { ignoredProductSchema } from "../../contracts/admin/ignored-products.js";
import type {
  brokenImageSchema,
  brokenImagesResponseSchema,
  cleanupResultSchema,
  clearRehostedResponseSchema,
  lowResImageEntrySchema,
  lowResImagesResponseSchema,
  missingImageCardSchema,
  rehostResultSchema,
  rehostStatusSchema,
  unrehostImagesInputSchema,
  unrehostResultSchema,
} from "../../contracts/admin/images.js";
import type {
  priceRefreshResponseSchema,
  priceRefreshUpsertCountsSchema,
  regenerateImagesCheckpointSchema,
} from "../../contracts/admin/job-results.js";
import type { languageSchema } from "../../contracts/admin/languages.js";
import type { markerSchema } from "../../contracts/admin/markers.js";
import type {
  groupKindEnum,
  marketplaceGroupSchema,
} from "../../contracts/admin/marketplace-groups.js";
import type { clearPricesResponseSchema } from "../../contracts/admin/operations.js";
import type { adminPrintingCitationSchema } from "../../contracts/admin/printing-citations.js";
import type { providerSettingSchema } from "../../contracts/admin/provider-settings.js";
import type { jobStartedResponseSchema } from "../../contracts/admin/shared.js";
import type { siteSettingSchema } from "../../contracts/admin/site-settings.js";
import type {
  stagedProductResponseSchema,
  unifiedMappingGroupResponseSchema,
  unifiedMappingsCardResponseSchema,
  unifiedMappingsResponseSchema,
} from "../../contracts/admin/unified-mappings.js";
import type { adminUserSchema } from "../../contracts/admin/users.js";
import type { marketplaceEnum } from "../../schemas.js";

export type {
  JobRunActivity,
  JobRunsListResponse,
  JobRunsQuery,
  JobRunView,
  JobStatus,
  JobTrigger,
} from "../../contracts/admin/job-runs.js";

export type CandidateCardResponse = z.infer<typeof candidateCardResponseSchema>;

export type CandidatePrintingResponse = z.infer<typeof candidatePrintingResponseSchema>;

export type CandidatePrintingGroupResponse = z.infer<typeof candidatePrintingGroupResponseSchema>;

export type AdminPrintingImageResponse = z.infer<typeof adminPrintingImageResponseSchema>;

export type CandidateCardSummaryResponse = z.infer<typeof candidateCardSummarySchema>;

export type ProviderStatsResponse = z.infer<typeof providerStatsItemSchema>;

export type CandidateCardUploadResponse = z.infer<typeof uploadCandidatesResponseSchema>;

// ── Admin card detail response types ────────────────────────────────────────

export type AdminCardResponse = z.infer<typeof adminCardResponseSchema>;

export type AdminPrintingResponse = z.infer<typeof adminPrintingResponseSchema>;

/** One source citation as the admin printing editor lists it. */
export type AdminPrintingCitation = z.infer<typeof adminPrintingCitationSchema>;

export type AdminMarketplaceName = z.infer<typeof marketplaceEnum>;

/**
 * A marketplace variant visible to a printing. When `ownerPrintingId` differs
 * from the printing this row is shown under, the variant is inherited via
 * sibling fan-out (Cardmarket cross-language aggregate — variants are stored
 * with `variantLanguage = null` and surface on every sibling printing).
 */
export type AdminPrintingMarketplaceMappingResponse = z.infer<
  typeof adminPrintingMarketplaceMappingResponseSchema
>;

export type AdminCardDetailResponse = z.infer<typeof adminCardDetailResponseSchema>;

export type UnmatchedCardDetailResponse = z.infer<typeof unmatchedCardDetailResponseSchema>;

// ── Admin list response types ───────────────────────────────────────────────

export type AdminSetResponse = z.infer<typeof adminSetSchema>;

export type MarketplaceGroupKind = z.infer<typeof groupKindEnum>;

export type MarketplaceGroupResponse = z.infer<typeof marketplaceGroupSchema>;

export type FeatureFlagResponse = z.infer<typeof flagSchema>;

export type SiteSettingResponse = z.infer<typeof siteSettingSchema>;

export type MarkerResponse = z.infer<typeof markerSchema>;

export type CustomTagResponse = z.infer<typeof customTagSchema>;

export type AdminCustomTagListResponse = z.infer<typeof adminCustomTagListResponseSchema>;

export type CustomTagCategoryResponse = z.infer<typeof customTagCategorySchema>;

export type AdminCustomTagCategoryListResponse = z.infer<
  typeof adminCustomTagCategoryListResponseSchema
>;

export type AdminCustomTagAssignmentsResponse = z.infer<
  typeof adminCustomTagAssignmentsResponseSchema
>;

export type TagCategoryResponse = z.infer<typeof tagCategoryResponseSchema>;

export type AdminTagCategoryListResponse = z.infer<typeof adminTagCategoryListResponseSchema>;

export type ClassifiedCardTag = z.infer<typeof classifiedCardTagSchema>;

export type AdminCardTagListResponse = z.infer<typeof adminCardTagListResponseSchema>;

export type DistributionChannelResponse = z.infer<typeof channelSchema>;

/** Per-printing channel link as exposed by admin endpoints. */
export type AdminPrintingDistributionChannelResponse = z.infer<
  typeof adminPrintingDistributionChannelResponseSchema
>;

export type LanguageResponse = z.infer<typeof languageSchema>;

export type ProviderSettingResponse = z.infer<typeof providerSettingSchema>;

export type IgnoredProductResponse = z.infer<typeof ignoredProductSchema>;

// ── Image rehosting response types ──────────────────────────────────────────

export type RehostImageResponse = z.infer<typeof rehostResultSchema>;

export type UnrehostImagesRequest = z.input<typeof unrehostImagesInputSchema>;

export type UnrehostImagesResponse = z.infer<typeof unrehostResultSchema>;

/**
 * Async-job kickoff response for regenerate-images. The actual progress is
 * tracked on the corresponding `job_runs` row's `result` JSONB; clients
 * poll that row to render progress and decide whether to offer resume.
 */
export type RegenerateImagesKickoffResponse = z.infer<typeof jobStartedResponseSchema>;

/**
 * Per-batch checkpoint written to `job_runs.result` while a regenerate job is
 * running, and left in place when the run finishes (succeeded, failed, or
 * cancelled). The `snapshot` is captured at run start so retries iterate the
 * same set even if images were added or removed in the meantime.
 *
 * Resume semantics: when the latest run for `images.regenerate` is `failed`
 * with `lastProcessedIndex < snapshot.length - 1` and `cancelRequested` is
 * false (or true — cancel is treated as a pause), a new run can pick up at
 * `lastProcessedIndex + 1`.
 */
export type RegenerateImagesCheckpoint = z.infer<typeof regenerateImagesCheckpointSchema>;

export type ClearRehostedResponse = z.infer<typeof clearRehostedResponseSchema>;

export type CleanupOrphanedResponse = z.infer<typeof cleanupResultSchema>;

export type RehostStatusSetStats = z.infer<typeof rehostStatusSchema>["sets"][number];

export type RehostStatusDiskStats = z.infer<typeof rehostStatusSchema>["disk"];

export type RehostStatusResponse = z.infer<typeof rehostStatusSchema>;

export type BrokenImageEntry = z.infer<typeof brokenImageSchema>;

export type BrokenImagesResponse = z.infer<typeof brokenImagesResponseSchema>;

export type LowResImageEntry = z.infer<typeof lowResImageEntrySchema>;

export type LowResImagesResponse = z.infer<typeof lowResImagesResponseSchema>;

export type MissingImageCard = z.infer<typeof missingImageCardSchema>;

// ── Price refresh response types ────────────────────────────────────────────

export type PriceRefreshUpsertCounts = z.infer<typeof priceRefreshUpsertCountsSchema>;

export type PriceRefreshResponse = z.infer<typeof priceRefreshResponseSchema>;

/**
 * Response for an admin endpoint that kicks off a long-running job in the
 * background. The caller gets a `runId` immediately and polls `/admin/job-runs`
 * for progress.
 */
export type JobRunStartedResponse = z.infer<typeof jobStartedResponseSchema>;

export type ClearPricesResponse = z.infer<typeof clearPricesResponseSchema>;

// ── Unified marketplace mappings response types ─────────────────────────────

export interface MappingPrintingResponse {
  printingId: string;
  /** Slug of the printing's set, used by the suggester to scope by group.setId. */
  setId: string;
  shortCode: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  markerSlugs: string[];
  finish: string;
  language: string;
  imageUrl: string | null;
  externalId: number | null;
}

/**
 * Inferred from {@link unifiedMappingGroupResponseSchema} (zod-first, the single
 * source of truth). Shares the {@link MappingPrintingResponse} fields minus its
 * single `externalId`, replacing it with the merged per-marketplace external
 * IDs (`tcgExternalId` / `cmExternalId` / `ctExternalId`).
 */
export type UnifiedMappingPrintingResponse = z.infer<
  typeof unifiedMappingGroupResponseSchema
>["printings"][number];

/**
 * One staged/assigned/unmatched marketplace product. Inferred from
 * {@link stagedProductResponseSchema}. `language` / `groupSetSlug` are `null`
 * when the marketplace doesn't expose that dimension.
 */
export type StagedProductResponse = z.infer<typeof stagedProductResponseSchema>;

/**
 * A single (product × printing) mapping row. Authoritative: survives cases
 * where one printing is bound to multiple variants of the same marketplace
 * (can happen when two upstream products target the same printing).
 * `language` is `null` when the marketplace doesn't expose language as a
 * SKU dimension (CM/TCG). Inferred from {@link unifiedMappingGroupResponseSchema}.
 */
export type MarketplaceAssignmentResponse = z.infer<
  typeof unifiedMappingGroupResponseSchema
>["tcgplayer"]["assignments"][number];

export type UnifiedMappingGroupResponse = z.infer<typeof unifiedMappingGroupResponseSchema>;

/** Inferred from {@link unifiedMappingsResponseSchema}'s `allCards` entries. */
export type AssignableCardResponse = z.infer<
  typeof unifiedMappingsResponseSchema
>["allCards"][number];

export type AdminUserResponse = z.infer<typeof adminUserSchema>;

export type UnifiedMappingsResponse = z.infer<typeof unifiedMappingsResponseSchema>;

/** Single-card variant of {@link UnifiedMappingsResponse} for the admin card-detail page. */
export type UnifiedMappingsCardResponse = z.infer<typeof unifiedMappingsCardResponseSchema>;
