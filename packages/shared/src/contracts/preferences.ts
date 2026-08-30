import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { currencySchema, marketplaceEnum } from "@openrift/shared/schemas";
import { z } from "zod";

import { TRADE_REQUEST_EMAIL_CADENCES } from "../types/api/preferences.js";
import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const themeEnum = z.enum(["light", "dark", "auto"]);

const paletteEnum = z.enum(["default", "minimal"]);

const defaultCardViewEnum = z.enum(["cards", "printings"]);

// ADR-030 email-notification channels. Named (not inlined) so the update body
// and the response share one definition and cannot drift — a prior inline copy
// omitted `tradeStatus`, which silently stripped it from both directions.
export const emailNotificationPreferenceSchema = z
  .object({
    tradeMatches: z.boolean().optional(),
    tradeRequests: z.boolean().optional(),
    tradeStatus: z.boolean().optional(),
    tradeRequestCadence: z.enum(TRADE_REQUEST_EMAIL_CADENCES).optional(),
    // Admin-only channel (ADR-036): a new in-app card submission landed for
    // review. Stored for anyone — the send side only ever reads it for users who
    // hold the admin role, so a stray `true` on a normal account delivers
    // nothing.
    cardSubmissions: z.boolean().optional(),
    // Group-admin channel: someone asked to join a group you own or administer.
    // Stored for anyone — the send side only reads it for the admins of the
    // group the request landed in.
    groupJoinRequests: z.boolean().optional(),
    // Group-member channel: an admin approved your request to join. Sent to the
    // requester, so unlike `groupJoinRequests` it is read for any member.
    groupApprovals: z.boolean().optional(),
  })
  .openapi("EmailNotificationPreference");

// Mirrors CompletionScopePreference (types/api/preferences.ts). One field
// object feeds both the write-side schema and the read-side (OpenAPI-named)
// schema below, so the two directions cannot drift — a prior separate write
// copy was once absent entirely, silently stripping the completionScope PATCH.
// Adding a field here also means adding it to COMPLETION_SCOPE_ARRAY_KEYS or
// COMPLETION_SCOPE_SCALAR_KEYS (types/api/preferences.ts), which clients walk
// to fold a scope; the exhaustiveness check there fails the build until you do.
const presenceStateEnum = z.enum(["any", "none"]);

const completionScopeFields = {
  sets: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  rarities: z.array(z.string()).optional(),
  finishes: z.array(z.string()).optional(),
  artVariants: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  customTags: z.array(z.string()).optional(),
  cardSizes: z.array(z.string()).optional(),
  // Tri-state "standard printing" constraint (ADR-034), matching
  // `isStandardPrinting`.
  standard: z.boolean().optional(),
  // Presence (has any / has none) per dimension that carries one. Markers have
  // their own `promos` field, kept as-is so stored scopes still read.
  keywordsPresence: presenceStateEnum.optional(),
  tagsPresence: presenceStateEnum.optional(),
  customTagsPresence: presenceStateEnum.optional(),
  // Negation companions (ADR-034), one per multi-select axis. An axis is never
  // include AND exclude at once, so these carry the "all but these" case the
  // filter chips produce on their second click.
  setsExclude: z.array(z.string()).optional(),
  languagesExclude: z.array(z.string()).optional(),
  domainsExclude: z.array(z.string()).optional(),
  typesExclude: z.array(z.string()).optional(),
  raritiesExclude: z.array(z.string()).optional(),
  finishesExclude: z.array(z.string()).optional(),
  artVariantsExclude: z.array(z.string()).optional(),
  keywordsExclude: z.array(z.string()).optional(),
  tagsExclude: z.array(z.string()).optional(),
  customTagsExclude: z.array(z.string()).optional(),
  promos: z.enum(["only", "exclude"]).optional(),
  signed: z.boolean().optional(),
  banned: z.boolean().optional(),
  errata: z.boolean().optional(),
};

const completionScopeWriteSchema = z.object(completionScopeFields);

export const updatePreferencesSchema = z.object({
  showImages: z.boolean().nullable().optional(),
  fancyFan: z.boolean().nullable().optional(),
  foilEffect: z.boolean().nullable().optional(),
  cardTilt: z.boolean().nullable().optional(),
  theme: themeEnum.nullable().optional(),
  palette: paletteEnum.nullable().optional(),
  marketplaceOrder: z
    .array(marketplaceEnum)
    .max(3)
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate marketplaces" })
    .nullable()
    .optional(),
  languages: z
    .array(z.string().min(1).max(2))
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate languages" })
    .nullable()
    .optional(),
  completionScope: completionScopeWriteSchema.nullable().optional(),
  defaultCardView: defaultCardViewEnum.nullable().optional(),
  defaultCurrency: currencySchema.nullable().optional(),
  // Retired in favour of `topLevelFilters`; still writable so the web can send
  // `null` to clear the legacy key from stored preferences.
  hiddenFilterSections: z
    .array(z.string().min(1).max(40))
    .max(40)
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate filter sections" })
    .nullable()
    .optional(),
  topLevelFilters: z
    .array(z.string().min(1).max(40))
    .max(40)
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate filter units" })
    .nullable()
    .optional(),
  // Retired preference (the compact bar is now the only filter layout); still
  // writable so the web can send `null` to clear the legacy key.
  compactFilterView: z.boolean().nullable().optional(),
  // ADR-030 email notifications. The shallow server merge replaces this whole
  // key, so the web always sends both channels (preserving the unchanged one);
  // `null` resets the object, restoring both defaults (digest off, request on).
  emailNotifications: emailNotificationPreferenceSchema.nullable().optional(),
});

export const completionScopePreferenceSchema = z
  .object(completionScopeFields)
  .openapi("CompletionScopePreference");

export const userPreferencesResponseSchema = z
  .object({
    showImages: z.boolean().optional(),
    fancyFan: z.boolean().optional(),
    foilEffect: z.boolean().optional(),
    cardTilt: z.boolean().optional(),
    theme: z.enum(["light", "dark", "auto"]).optional(),
    palette: z.enum(["default", "minimal"]).optional(),
    marketplaceOrder: z.array(z.enum(["tcgplayer", "cardmarket", "cardtrader"])).optional(),
    // The web sends + reads these (use-preferences-sync.ts); they must round-trip.
    languages: z.array(z.string()).optional(),
    completionScope: completionScopePreferenceSchema.optional(),
    defaultCardView: z.enum(["cards", "printings"]).optional(),
    defaultCurrency: z.enum(["EUR", "USD"]).optional(),
    topLevelFilters: z.array(z.string()).optional(),
    // ADR-030: round-trips so the profile toggles read the stored state.
    emailNotifications: emailNotificationPreferenceSchema.optional(),
  })
  .openapi("UserPreferencesResponse");

/**
 * oRPC contract for the authenticated user-preferences endpoints.
 *
 * `GET /api/v1/preferences` — the caller's stored preferences.
 * `PATCH /api/v1/preferences` — partial update (all fields optional; `null`
 * resets a key to its default). Both require a session (UNAUTHORIZED on missing
 * session). Input-validation failures are oRPC-native 400s.
 */
export const preferencesContract = {
  get: authedRoute
    .route({ method: "GET", path: "/api/v1/preferences", tags: ["Preferences"] })
    .output(userPreferencesResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: "/api/v1/preferences", tags: ["Preferences"] })
    .input(updatePreferencesSchema)
    .output(userPreferencesResponseSchema),
};

export type PreferencesContract = typeof preferencesContract;
