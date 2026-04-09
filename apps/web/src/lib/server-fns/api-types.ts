// Type-level helpers for server function return types.
// Uses Hono's InferResponseType to derive API response shapes at compile time
// without any runtime dependency on the Hono client.

import type { AppType } from "api/rpc";
import type { InferResponseType, hc } from "hono/client";

type Client = ReturnType<typeof hc<AppType>>;

// ── Admin card endpoints ────────────────────────────────────────────────────
export type AdminCardListResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["cards"]["$get"]
>;
export type AllCardsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["cards"]["all-cards"]["$get"]
>;
export type AdminCardDetailResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["cards"][":cardSlug"]["$get"]
>;
export type UnmatchedCardDetailResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["cards"]["new"][":name"]["$get"]
>;
export type ProviderStatsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["cards"]["provider-stats"]["$get"]
>;
export type ProviderNamesResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["cards"]["provider-names"]["$get"]
>;
export type DistinctArtistsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["cards"]["distinct-artists"]["$get"]
>;

// ── Admin general endpoints ─────────────────────────────────────────────────
export type AdminUsersResponse = InferResponseType<Client["api"]["v1"]["admin"]["users"]["$get"]>;
export type AdminStatusResponse = InferResponseType<Client["api"]["v1"]["admin"]["status"]["$get"]>;
export type AdminSiteSettingsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["site-settings"]["$get"]
>;
export type KeywordStatsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["keyword-stats"]["$get"]
>;
export type IgnoredCandidatesResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["ignored-candidates"]["$get"]
>;
export type ProviderSettingsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["provider-settings"]["$get"]
>;
export type AdminDeckZonesResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["deck-zones"]["$get"]
>;
export type IgnoredProductsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["ignored-products"]["$get"]
>;
export type MarketplaceGroupsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["marketplace-groups"]["$get"]
>;
export type AdminPromoTypesResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["promo-types"]["$get"]
>;
export type AdminLanguagesResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["languages"]["$get"]
>;
export type AdminFeatureFlagsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["feature-flags"]["$get"]
>;
export type AdminFeatureFlagOverridesResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["feature-flags"]["overrides"]["$get"]
>;
export type TypographyReviewResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["typography-review"]["$get"]
>;
export type AdminSetsResponse = InferResponseType<Client["api"]["v1"]["admin"]["sets"]["$get"]>;
export type AdminDomainsResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["domains"]["$get"]
>;
export type AdminFinishesResponse = InferResponseType<
  Client["api"]["v1"]["admin"]["finishes"]["$get"]
>;

// ── Public endpoints ────────────────────────────────────────────────────────
export type InitResponse = InferResponseType<Client["api"]["v1"]["init"]["$get"]>;
export type CollectionsResponse = InferResponseType<Client["api"]["v1"]["collections"]["$get"]>;
export type CopiesResponse = InferResponseType<Client["api"]["v1"]["copies"]["$get"]>;
// ── MarketplaceGroup derived type ───────────────────────────────────────────
export type MarketplaceGroup = MarketplaceGroupsResponse["groups"][number];
