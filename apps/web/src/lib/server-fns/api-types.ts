// Server-function response/body type aliases. Every endpoint these once derived
// from the Hono `hc` client (`InferResponseType<Client[...]>`) is now migrated to
// oRPC, so the shapes come straight from the shared contracts / interfaces — no
// `hc`/`AppType` dependency remains here.

import type {
  CandidateCardSummaryResponse,
  CollectionListResponse,
  ProviderStatsResponse as ProviderStatsItem,
} from "@openrift/shared";

// ── Request body types (derived from the route schemas) ─────────────────────
// Candidate uploads come from an arbitrary user-uploaded JSON file, so the
// parser casts to this; the API validates the real shape server-side.
// upload migrated to oRPC; body (pre-transform input) + response come from the contract.
export type { UploadCandidatesBody, UploadCandidatesResponse } from "@openrift/shared/contracts";

// ── Admin card field-map mutation bodies ─────────────────────────────────────
// The admin editor is a generic field editor; these body shapes are what its
// dynamic output is cast to at the call boundary (the API validates the real
// shape server-side). All migrated to oRPC — types now come from the contract.
export type {
  AcceptCardFieldBody,
  AcceptNewCardBody,
  AcceptPrintingBody,
  AcceptPrintingFieldBody,
  CreateCardBody,
  CreatePrintingBody,
  PatchCandidatePrintingBody,
} from "@openrift/shared/contracts";

// ── Admin card endpoints ────────────────────────────────────────────────────
// Read-only card queries migrated to oRPC. The list / all-cards / provider
// payloads are typed from the contract or the hand-written shared interfaces.
// The two detail endpoints (and export) were always loosely typed (the old
// `z.record(z.string(), z.any())` response, contract `z.unknown()` now), so
// they stay `Record<string, any>` here — the rich shared interfaces carry
// `unknown` fields that the TanStack server-fn serialization checker rejects.
export type { AllCardsResponse } from "@openrift/shared/contracts";
export type AdminCardListResponse = CandidateCardSummaryResponse[];
export type ProviderStatsResponse = ProviderStatsItem[];
export type ProviderNamesResponse = string[];
export type DistinctArtistsResponse = string[];
// oxlint-disable-next-line typescript/no-explicit-any -- loose passthrough detail payload (was hc `any`)
export type AdminCardDetailResponse = Record<string, any>;
// oxlint-disable-next-line typescript/no-explicit-any -- loose passthrough detail payload (was hc `any`)
export type UnmatchedCardDetailResponse = Record<string, any>;

// ── Admin general endpoints ─────────────────────────────────────────────────
// users migrated to oRPC; its response type now lives on the contract.
export type { AdminUsersResponse } from "@openrift/shared/contracts";
// job-runs migrated to oRPC; its response types now live on the contract.
export type { JobRunsListResponse, JobRunView } from "@openrift/shared/contracts";
// ignored-candidates / ignored-products migrated to oRPC; response types now
// live on their contracts.
export type {
  IgnoredCandidatesResponse,
  IgnoredProductsResponse,
} from "@openrift/shared/contracts";
// marketplace-groups migrated to oRPC; its response + row types live on the
// contract (re-exported below near the other contract types).
// typography-review migrated to oRPC; its response type lives on the contract.
export type { TypographyReviewResponse } from "@openrift/shared/contracts";
// printing-events migrated to oRPC; its response types now live on the contract.
export type { PrintingEventsListResponse, PrintingEventView } from "@openrift/shared/contracts";
// admin sets (catalog) migrated to oRPC; its response type lives on the contract.
export type { AdminSetsResponse } from "@openrift/shared/contracts";
// art-variants / card-types / deck-formats / domains / finishes / rarities /
// super-types migrated to oRPC; their response types now live on their contracts.
export type {
  AdminArtVariantsResponse,
  AdminCardTypesResponse,
  AdminDeckFormatsResponse,
  AdminDomainsResponse,
  AdminRaritiesResponse,
  AdminFinishesResponse,
  AdminSuperTypesResponse,
} from "@openrift/shared/contracts";
// Unified marketplace mappings migrated to oRPC; response types live on the
// contract (derived from the shared unifiedMappings*ResponseSchema).
export type {
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared/contracts";

// ── Public endpoints ────────────────────────────────────────────────────────
// InitResponse moved to @openrift/shared — /init was migrated to oRPC and no
// longer lives on the hc AppType. Import it from "@openrift/shared".
// Collections likewise migrated to oRPC; alias the contract-derived list type
// so existing consumers (query-cache typings) keep the same shape.
export type CollectionsResponse = CollectionListResponse;
// ── MarketplaceGroup types (from the oRPC contract) ─────────────────────────
export type { MarketplaceGroup, MarketplaceGroupsResponse } from "@openrift/shared/contracts";
