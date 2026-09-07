import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { currencySchema, marketplaceEnum } from "@openrift/shared/schemas";
import { z } from "zod";

import { TRADE_REQUEST_EMAIL_CADENCES } from "../types/api/preferences.js";
import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const themeEnum = z.enum(["light", "dark", "auto"]);

const paletteEnum = z.enum(["default", "minimal"]);

const defaultCardViewEnum = z.enum(["cards", "printings"]);

export const emailNotificationPreferenceSchema = z
  .object({
    tradeMatches: z.boolean().optional(),
    tradeRequests: z.boolean().optional(),
    tradeStatus: z.boolean().optional(),
    tradeRequestCadence: z.enum(TRADE_REQUEST_EMAIL_CADENCES).optional(),
    cardSubmissions: z.boolean().optional(),
    groupJoinRequests: z.boolean().optional(),
    groupApprovals: z.boolean().optional(),
  })
  .openapi("EmailNotificationPreference");

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
  standard: z.boolean().optional(),
  keywordsPresence: presenceStateEnum.optional(),
  tagsPresence: presenceStateEnum.optional(),
  customTagsPresence: presenceStateEnum.optional(),
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
  compactFilterView: z.boolean().nullable().optional(),
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
    languages: z.array(z.string()).optional(),
    completionScope: completionScopePreferenceSchema.optional(),
    defaultCardView: z.enum(["cards", "printings"]).optional(),
    defaultCurrency: z.enum(["EUR", "USD"]).optional(),
    topLevelFilters: z.array(z.string()).optional(),
    emailNotifications: emailNotificationPreferenceSchema.optional(),
  })
  .openapi("UserPreferencesResponse");

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
