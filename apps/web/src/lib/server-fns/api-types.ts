// Type-level helpers for server function return types.
// Uses Hono's InferResponseType to derive API response shapes at compile time
// without any runtime dependency on the Hono client.

import type { ApiErrorResponse } from "@openrift/shared";
import type { AppType } from "api/rpc";
import type { InferRequestType, InferResponseType as RawInferResponseType, hc } from "hono/client";

type Client = ReturnType<typeof hc<AppType>>;

// Routes now declare their 4xx responses with the `{ error, code }` envelope, so
// hc folds `ApiErrorResponse` into every endpoint's response union. The server
// functions always go through `callApi`/`callApiJson`, which throw on a non-ok
// status, so the success body is the only shape a caller ever receives — strip
// the error envelope from the derived types so consumers see the success shape.
type InferResponseType<T> = Exclude<RawInferResponseType<T>, ApiErrorResponse>;

// ── Request body types (derived from the route schemas) ─────────────────────
// Candidate uploads come from an arbitrary user-uploaded JSON file, so the
// parser casts to this; the API validates the real shape server-side.
export type UploadCandidatesBody = InferRequestType<
  Client["api"]["admin"]["v1"]["cards"]["upload"]["$post"]
>["json"];
export type UploadCandidatesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["cards"]["upload"]["$post"]
>;

// ── Admin card field-map mutation bodies ─────────────────────────────────────
// The admin editor is a generic field editor; these derived types are the
// concrete route shapes its dynamic output is cast to at the call boundary
// (the API validates the real shape server-side).
export type AcceptNewCardBody = InferRequestType<
  Client["api"]["admin"]["v1"]["cards"]["new"][":name"]["accept"]["$post"]
>["json"];
export type PatchCandidatePrintingBody = InferRequestType<
  Client["api"]["admin"]["v1"]["cards"]["candidate-printings"][":id"]["$patch"]
>["json"];
export type AcceptPrintingBody = InferRequestType<
  Client["api"]["admin"]["v1"]["cards"][":cardId"]["accept-printing"]["$post"]
>["json"];
// accept-field `field` is a typed enum on the wire. The admin
// field-editor passes a dynamic string key, cast to this enum at the boundary.
export type AcceptCardFieldBody = InferRequestType<
  Client["api"]["admin"]["v1"]["cards"][":cardId"]["accept-field"]["$post"]
>["json"];
export type AcceptPrintingFieldBody = InferRequestType<
  Client["api"]["admin"]["v1"]["cards"]["printing"][":printingId"]["accept-field"]["$post"]
>["json"];
// acceptNewCard and createCard share the card-fields shape (acceptNewCardSchema
// nests it under `cardFields`; createCardSchema is the same object at the top
// level), but they are derived independently to stay aligned with each route.
export type CreateCardBody = InferRequestType<
  Client["api"]["admin"]["v1"]["cards"]["create"]["$post"]
>["json"];
export type CreatePrintingBody = InferRequestType<
  Client["api"]["admin"]["v1"]["cards"][":cardId"]["printings"]["$post"]
>["json"];

// ── Admin card endpoints ────────────────────────────────────────────────────
export type AdminCardListResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["cards"]["$get"]
>;
export type AllCardsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["cards"]["all-cards"]["$get"]
>;
export type AdminCardDetailResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["cards"][":cardSlug"]["$get"]
>;
export type UnmatchedCardDetailResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["cards"]["new"][":name"]["$get"]
>;
export type ProviderStatsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["cards"]["provider-stats"]["$get"]
>;
export type ProviderNamesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["cards"]["provider-names"]["$get"]
>;
export type DistinctArtistsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["cards"]["distinct-artists"]["$get"]
>;

// ── Admin general endpoints ─────────────────────────────────────────────────
export type AdminUsersResponse = InferResponseType<Client["api"]["admin"]["v1"]["users"]["$get"]>;
export type JobRunsListResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["job-runs"]["$get"]
>;
export type JobRunView = JobRunsListResponse["runs"][number];
export type AdminStatusResponse = InferResponseType<Client["api"]["admin"]["v1"]["status"]["$get"]>;
export type AdminSiteSettingsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["site-settings"]["$get"]
>;
export type KeywordStatsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["keyword-stats"]["$get"]
>;
export type IgnoredCandidatesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["ignored-candidates"]["$get"]
>;
export type ProviderSettingsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["provider-settings"]["$get"]
>;
export type AdminDeckZonesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["deck-zones"]["$get"]
>;
export type IgnoredProductsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["ignored-products"]["$get"]
>;
export type MarketplaceGroupsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["marketplace-groups"]["$get"]
>;
export type AdminLanguagesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["languages"]["$get"]
>;
export type AdminFeatureFlagsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["feature-flags"]["$get"]
>;
export type AdminFeatureFlagOverridesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["feature-flags"]["overrides"]["$get"]
>;
export type TypographyReviewResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["typography-review"]["$get"]
>;
export type PrintingEventsListResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["printing-events"]["$get"]
>;
// Derived from the API (not hand-written): the field-diff `from`/`to` are
// arbitrary JSON, which hc types as its own JSON value — deriving keeps the web
// type exactly aligned with what the endpoint returns.
export type PrintingEventView = PrintingEventsListResponse["events"][number];
export type AdminSetsResponse = InferResponseType<Client["api"]["admin"]["v1"]["sets"]["$get"]>;
export type AdminDomainsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["domains"]["$get"]
>;
export type AdminFinishesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["finishes"]["$get"]
>;
export type AdminArtVariantsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["art-variants"]["$get"]
>;
export type AdminRaritiesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["rarities"]["$get"]
>;
export type AdminCardTypesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["card-types"]["$get"]
>;
export type AdminSuperTypesResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["super-types"]["$get"]
>;
export type AdminDeckFormatsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["deck-formats"]["$get"]
>;
// Unified marketplace mappings — both GETs now have concrete response schemas
// (unifiedMappingsResponseSchema / unifiedMappingsCardResponseSchema), so hc
// infers the full shape and the web types drop their hand-written annotations.
export type UnifiedMappingsResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["marketplace-mappings"]["$get"]
>;
export type UnifiedMappingsCardResponse = InferResponseType<
  Client["api"]["admin"]["v1"]["marketplace-mappings"]["card"][":cardId"]["$get"]
>;

// ── Public endpoints ────────────────────────────────────────────────────────
export type InitResponse = InferResponseType<Client["api"]["v1"]["init"]["$get"]>;
export type CollectionsResponse = InferResponseType<Client["api"]["v1"]["collections"]["$get"]>;
// ── MarketplaceGroup derived type ───────────────────────────────────────────
export type MarketplaceGroup = MarketplaceGroupsResponse["groups"][number];
