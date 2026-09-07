import type {
  CandidateCardSummaryResponse,
  CollectionListResponse,
  ProviderStatsResponse as ProviderStatsItem,
} from "@openrift/shared";

export type {
  UploadCandidatesBody,
  UploadCandidatesResponse,
} from "@openrift/shared/contracts/admin/card-mutations";

export type {
  AcceptNewCardBody,
  AcceptPrintingBody,
  CreateCardBody,
  CreatePrintingBody,
  PatchCandidatePrintingBody,
} from "@openrift/shared/contracts/admin/card-mutations";

export type { AllCardsResponse } from "@openrift/shared/contracts/admin/card-queries";
export type AdminCardListResponse = CandidateCardSummaryResponse[];
export type ProviderStatsResponse = ProviderStatsItem[];
export type ProviderNamesResponse = string[];
export type DistinctArtistsResponse = string[];
// oxlint-disable-next-line typescript/no-explicit-any -- loose passthrough detail payload
export type AdminCardDetailResponse = Record<string, any>;
// oxlint-disable-next-line typescript/no-explicit-any -- loose passthrough detail payload
export type UnmatchedCardDetailResponse = Record<string, any>;

export type { AdminUsersResponse } from "@openrift/shared/contracts/admin/users";
export type { JobRunView } from "@openrift/shared/contracts/admin/job-runs";
export type { IgnoredCandidatesResponse } from "@openrift/shared/contracts/admin/ignored-candidates";
export type { IgnoredProductsResponse } from "@openrift/shared/contracts/admin/ignored-products";
export type {
  PrintingEventView,
  PrintingEventsListResponse,
} from "@openrift/shared/contracts/admin/printing-events";
export type {
  AdminAuditActionsResponse,
  AdminAuditActorsResponse,
  AdminAuditEventResponse,
  AdminAuditEventsListResponse,
} from "@openrift/shared/contracts/admin/audit-events";
export type { AdminSetsResponse } from "@openrift/shared/contracts/admin/catalog";
export type {
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared/contracts/admin/unified-mappings";

export type CollectionsResponse = CollectionListResponse;
export type { MarketplaceGroup } from "@openrift/shared/contracts/admin/marketplace-groups";
