import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { currencySchema, marketplaceEnum } from "@openrift/shared/schemas";
import { z } from "zod";

import { TRADE_REQUEST_EMAIL_CADENCES } from "../types/api/preferences.js";
import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const themeEnum = z.enum(["light", "dark", "auto"]);

const paletteEnum = z.enum(["default", "minimal"]);

const defaultCardViewEnum = z.enum(["cards", "printings"]);

// Mirrors CompletionScopePreference (types/api/preferences.ts) and the read-side
// completionScopePreferenceSchema in response-schemas.ts. Previously absent here,
// so the web's completionScope PATCH was silently stripped and never persisted.
const completionScopeWriteSchema = z.object({
  sets: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  rarities: z.array(z.string()).optional(),
  finishes: z.array(z.string()).optional(),
  artVariants: z.array(z.string()).optional(),
  promos: z.enum(["only", "exclude"]).optional(),
  signed: z.boolean().optional(),
  banned: z.boolean().optional(),
  errata: z.boolean().optional(),
});

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
    .array(z.string().min(1).max(5))
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate languages" })
    .nullable()
    .optional(),
  completionScope: completionScopeWriteSchema.nullable().optional(),
  defaultCardView: defaultCardViewEnum.nullable().optional(),
  defaultCurrency: currencySchema.nullable().optional(),
  hiddenFilterSections: z
    .array(z.string().min(1).max(40))
    .max(40)
    .refine((arr) => new Set(arr).size === arr.length, { message: "Duplicate filter sections" })
    .nullable()
    .optional(),
  compactFilterView: z.boolean().nullable().optional(),
  // ADR-030 email notifications. The shallow server merge replaces this whole
  // key, so the web always sends both channels (preserving the unchanged one);
  // `null` resets the object, restoring both defaults (digest off, request on).
  emailNotifications: z
    .object({
      tradeMatches: z.boolean().optional(),
      tradeRequests: z.boolean().optional(),
      tradeRequestCadence: z.enum(TRADE_REQUEST_EMAIL_CADENCES).optional(),
    })
    .nullable()
    .optional(),
});

// Mirrors the CompletionScopePreference type (types/api/preferences.ts). Kept in
// sync with the write-side schema in schemas.ts (updatePreferencesSchema).
const completionScopePreferenceSchema = z
  .object({
    sets: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
    types: z.array(z.string()).optional(),
    rarities: z.array(z.string()).optional(),
    finishes: z.array(z.string()).optional(),
    artVariants: z.array(z.string()).optional(),
    promos: z.enum(["only", "exclude"]).optional(),
    signed: z.boolean().optional(),
    banned: z.boolean().optional(),
    errata: z.boolean().optional(),
  })
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
    hiddenFilterSections: z.array(z.string()).optional(),
    compactFilterView: z.boolean().optional(),
    // ADR-030: round-trips so the profile toggles read the stored state.
    emailNotifications: z
      .object({
        tradeMatches: z.boolean().optional(),
        tradeRequests: z.boolean().optional(),
        tradeRequestCadence: z.enum(TRADE_REQUEST_EMAIL_CADENCES).optional(),
      })
      .optional(),
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
