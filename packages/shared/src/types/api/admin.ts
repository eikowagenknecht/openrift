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
import type {
  clearPricesResponseSchema,
  siblingVariantDriftResponseSchema,
} from "../../contracts/admin/operations.js";
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

export type AdminCardResponse = z.infer<typeof adminCardResponseSchema>;

export type AdminPrintingResponse = z.infer<typeof adminPrintingResponseSchema>;

export type AdminPrintingCitation = z.infer<typeof adminPrintingCitationSchema>;

export type AdminMarketplaceName = z.infer<typeof marketplaceEnum>;

/**
 * When `ownerPrintingId` differs from the printing this row is shown under,
 * the variant is inherited via Cardmarket's cross-language sibling fan-out.
 */
export type AdminPrintingMarketplaceMappingResponse = z.infer<
  typeof adminPrintingMarketplaceMappingResponseSchema
>;

export type AdminCardDetailResponse = z.infer<typeof adminCardDetailResponseSchema>;

export type UnmatchedCardDetailResponse = z.infer<typeof unmatchedCardDetailResponseSchema>;

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

export type AdminPrintingDistributionChannelResponse = z.infer<
  typeof adminPrintingDistributionChannelResponseSchema
>;

export type LanguageResponse = z.infer<typeof languageSchema>;

export type ProviderSettingResponse = z.infer<typeof providerSettingSchema>;

export type IgnoredProductResponse = z.infer<typeof ignoredProductSchema>;

export type RehostImageResponse = z.infer<typeof rehostResultSchema>;

export type UnrehostImagesRequest = z.input<typeof unrehostImagesInputSchema>;

export type UnrehostImagesResponse = z.infer<typeof unrehostResultSchema>;

/** Progress is tracked on the `job_runs` row's `result` JSONB; clients poll that row. */
export type RegenerateImagesKickoffResponse = z.infer<typeof jobStartedResponseSchema>;

/**
 * `snapshot` is captured at run start so a resumed run iterates the same set
 * even if images were added or removed in the meantime.
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

export type PriceRefreshUpsertCounts = z.infer<typeof priceRefreshUpsertCountsSchema>;

export type PriceRefreshResponse = z.infer<typeof priceRefreshResponseSchema>;

/** Caller gets a `runId` immediately and polls `/admin/job-runs` for progress. */
export type JobRunStartedResponse = z.infer<typeof jobStartedResponseSchema>;

export type ClearPricesResponse = z.infer<typeof clearPricesResponseSchema>;

export type SiblingVariantDriftResponse = z.infer<typeof siblingVariantDriftResponseSchema>;

/** Carries the merged per-marketplace external IDs (`tcgExternalId` / `cmExternalId` / `ctExternalId`). */
export type UnifiedMappingPrintingResponse = z.infer<
  typeof unifiedMappingGroupResponseSchema
>["printings"][number];

/** Same fields as {@link UnifiedMappingPrintingResponse}, with the three external IDs collapsed to one `externalId`. */
export type MappingPrintingResponse = Omit<
  UnifiedMappingPrintingResponse,
  "tcgExternalId" | "cmExternalId" | "ctExternalId"
> & { externalId: number | null };

/** `language` / `groupSetSlug` are `null` when the marketplace doesn't expose that dimension. */
export type StagedProductResponse = z.infer<typeof stagedProductResponseSchema>;

/**
 * Survives one printing being bound to multiple variants of the same
 * marketplace (two upstream products targeting the same printing).
 */
export type MarketplaceAssignmentResponse = z.infer<
  typeof unifiedMappingGroupResponseSchema
>["tcgplayer"]["assignments"][number];

export type UnifiedMappingGroupResponse = z.infer<typeof unifiedMappingGroupResponseSchema>;

export type MappingGroupHeader = Pick<
  UnifiedMappingGroupResponse,
  | "cardId"
  | "cardSlug"
  | "cardName"
  | "superTypes"
  | "domains"
  | "energy"
  | "might"
  | "setId"
  | "setName"
>;

export type AssignableCardResponse = z.infer<
  typeof unifiedMappingsResponseSchema
>["allCards"][number];

export type AdminUserResponse = z.infer<typeof adminUserSchema>;

export type UnifiedMappingsResponse = z.infer<typeof unifiedMappingsResponseSchema>;

export type UnifiedMappingsCardResponse = z.infer<typeof unifiedMappingsCardResponseSchema>;
