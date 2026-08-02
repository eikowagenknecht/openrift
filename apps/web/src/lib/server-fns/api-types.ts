// Server-function response/body type aliases. The shapes come straight from the
// shared contracts / interfaces.

import type {
  CandidateCardSummaryResponse,
  CollectionListResponse,
  ProviderStatsResponse as ProviderStatsItem,
} from "@openrift/shared";

// ── Request body types (derived from the route schemas) ─────────────────────
// Candidate uploads come from an arbitrary user-uploaded JSON file, so the
// parser casts to this; the API validates the real shape server-side.
// Body (pre-transform input) + response come from the contract.
export type {
  UploadCandidatesBody,
  UploadCandidatesResponse,
} from "@openrift/shared/contracts/admin/card-mutations";

// ── Admin card field-map mutation bodies ─────────────────────────────────────
// The admin editor is a generic field editor; these body shapes are what its
// dynamic output is cast to at the call boundary (the API validates the real
// shape server-side). Types come from the contract.
export type {
  AcceptCardFieldBody,
  AcceptNewCardBody,
  AcceptPrintingBody,
  AcceptPrintingFieldBody,
  CreateCardBody,
  CreatePrintingBody,
  PatchCandidatePrintingBody,
} from "@openrift/shared/contracts/admin/card-mutations";

// ── Admin card endpoints ────────────────────────────────────────────────────
// The list / all-cards / provider payloads are typed from the contract or the
// hand-written shared interfaces. The two detail endpoints (and export) are
// loosely typed (contract `z.unknown()` response), so they stay
// `Record<string, any>` here: the rich shared interfaces carry `unknown` fields
// that the TanStack server-fn serialization checker rejects.
export type { AllCardsResponse } from "@openrift/shared/contracts/admin/card-queries";
export type AdminCardListResponse = CandidateCardSummaryResponse[];
export type ProviderStatsResponse = ProviderStatsItem[];
export type ProviderNamesResponse = string[];
export type DistinctArtistsResponse = string[];
// oxlint-disable-next-line typescript/no-explicit-any -- loose passthrough detail payload
export type AdminCardDetailResponse = Record<string, any>;
// oxlint-disable-next-line typescript/no-explicit-any -- loose passthrough detail payload
export type UnmatchedCardDetailResponse = Record<string, any>;

// ── Admin general endpoints ─────────────────────────────────────────────────
// users
export type { AdminUsersResponse } from "@openrift/shared/contracts/admin/users";
// job-runs
export type { JobRunView } from "@openrift/shared/contracts/admin/job-runs";
// ignored-candidates / ignored-products
export type { IgnoredCandidatesResponse } from "@openrift/shared/contracts/admin/ignored-candidates";
export type { IgnoredProductsResponse } from "@openrift/shared/contracts/admin/ignored-products";
// marketplace-groups: re-exported below near the other contract types.
// printing-events
export type {
  PrintingEventView,
  PrintingEventsListResponse,
} from "@openrift/shared/contracts/admin/printing-events";
// admin audit log (migration 201)
export type {
  AdminAuditActionsResponse,
  AdminAuditActorsResponse,
  AdminAuditEventResponse,
  AdminAuditEventsListResponse,
} from "@openrift/shared/contracts/admin/audit-events";
// admin sets (catalog)
export type { AdminSetsResponse } from "@openrift/shared/contracts/admin/catalog";
// Unified marketplace mappings (derived from the shared unifiedMappings*ResponseSchema).
export type {
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared/contracts/admin/unified-mappings";

// ── Public endpoints ────────────────────────────────────────────────────────
// InitResponse lives in "@openrift/shared"; import it from there.
// Alias the contract-derived list type so existing consumers (query-cache
// typings) keep the same shape.
export type CollectionsResponse = CollectionListResponse;
// ── MarketplaceGroup types (from the oRPC contract) ─────────────────────────
export type { MarketplaceGroup } from "@openrift/shared/contracts/admin/marketplace-groups";
