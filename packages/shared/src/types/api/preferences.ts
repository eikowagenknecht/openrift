import type {
  completionScopePreferenceSchema,
  emailNotificationPreferenceSchema,
  userPreferencesResponseSchema,
} from "@openrift/shared/contracts/preferences";
import type { z } from "zod";

import { WellKnown } from "../../well-known.js";
import { ALL_MARKETPLACES } from "../pricing.js";
import type { Marketplace } from "../pricing.js";
import type { Currency } from "./trade-preferences.js";

export type Theme = "light" | "dark" | "auto";

/**
 * Orthogonal to Theme: Theme picks light/dark, Palette picks the variable set
 * inside it. Adding one needs a `[data-palette="X"]` block in index.css too.
 */
export type Palette = (typeof PALETTES)[number];

export const PALETTES = ["default", "minimal"] as const;

export type DefaultCardView = "cards" | "printings";

export type CompletionScopePreference = z.infer<typeof completionScopePreferenceSchema>;

type CompletionScopeKey = keyof CompletionScopePreference;

type ScopeKeyKind = "array" | "scalar";

/**
 * `satisfies` forces every field added to `completionScopeFields` to be
 * classified here before the build passes.
 */
const COMPLETION_SCOPE_KEY_KINDS = {
  sets: "array",
  languages: "array",
  domains: "array",
  types: "array",
  rarities: "array",
  finishes: "array",
  artVariants: "array",
  keywords: "array",
  tags: "array",
  customTags: "array",
  cardSizes: "array",
  setsExclude: "array",
  languagesExclude: "array",
  domainsExclude: "array",
  typesExclude: "array",
  raritiesExclude: "array",
  finishesExclude: "array",
  artVariantsExclude: "array",
  keywordsExclude: "array",
  tagsExclude: "array",
  customTagsExclude: "array",
  promos: "scalar",
  signed: "scalar",
  banned: "scalar",
  errata: "scalar",
  standard: "scalar",
  keywordsPresence: "scalar",
  tagsPresence: "scalar",
  customTagsPresence: "scalar",
} as const satisfies Record<CompletionScopeKey, ScopeKeyKind>;

type ScopeKeysOfKind<K extends ScopeKeyKind> = {
  [P in CompletionScopeKey]: (typeof COMPLETION_SCOPE_KEY_KINDS)[P] extends K ? P : never;
}[CompletionScopeKey];

function scopeKeysOfKind<K extends ScopeKeyKind>(kind: K): readonly ScopeKeysOfKind<K>[] {
  const keys = Object.keys(COMPLETION_SCOPE_KEY_KINDS) as CompletionScopeKey[];
  return keys.filter((key) => COMPLETION_SCOPE_KEY_KINDS[key] === kind) as ScopeKeysOfKind<K>[];
}

export const COMPLETION_SCOPE_ARRAY_KEYS = scopeKeysOfKind("array");

export const COMPLETION_SCOPE_SCALAR_KEYS = scopeKeysOfKind("scalar");

/**
 * `emailNotifications`'s two channels default differently (digest off,
 * request on) via the read-side gates below, not the stored data.
 */
export type UserPreferencesResponse = z.infer<typeof userPreferencesResponseSchema>;

/** `instant` sends immediately; `Nmin` debounces a burst into one email N minutes after the last request. */
export const TRADE_REQUEST_EMAIL_CADENCES = ["instant", "5min", "15min", "30min", "60min"] as const;
export type TradeRequestEmailCadence = (typeof TRADE_REQUEST_EMAIL_CADENCES)[number];

export const TRADE_REQUEST_EMAIL_CADENCE_MINUTES: Record<TradeRequestEmailCadence, number> = {
  instant: 0,
  "5min": 5,
  "15min": 15,
  "30min": 30,
  "60min": 60,
};

export const DEFAULT_TRADE_REQUEST_EMAIL_CADENCE: TradeRequestEmailCadence = "5min";

/**
 * `tradeMatches`/`tradeRequests` are opt-in; `tradeStatus` is opt-out (on
 * unless `false`); `tradeRequestCadence` covers request and status emails.
 */
export type EmailNotificationPreference = z.infer<typeof emailNotificationPreferenceSchema>;

/** Pinned to the boolean opt-in keys, not `keyof EmailNotificationPreference`, so the cadence field stays out of the toggle path. */
export type EmailNotificationChannel =
  | "tradeMatches"
  | "tradeRequests"
  | "tradeStatus"
  | "cardSubmissions"
  | "groupJoinRequests"
  | "groupApprovals";

/**
 * Must read naturally in "You'll no longer receive {label}." and
 * "Unsubscribe from {label}?"; shared across the unsubscribe page and email copy.
 */
export const EMAIL_NOTIFICATION_CHANNEL_LABELS: Record<EmailNotificationChannel, string> = {
  tradeMatches: "the daily match digest",
  tradeRequests: "trade-request emails",
  tradeStatus: "trade status updates",
  cardSubmissions: "card submission alerts",
  groupJoinRequests: "group join requests",
  groupApprovals: "group welcome emails",
};

export function isTradeMatchDigestEnabled(prefs: EmailNotificationPreference | undefined): boolean {
  return prefs?.tradeMatches === true;
}

export function isTradeRequestEmailEnabled(
  prefs: EmailNotificationPreference | undefined,
): boolean {
  return prefs?.tradeRequests !== false;
}

export function isTradeStatusEmailEnabled(prefs: EmailNotificationPreference | undefined): boolean {
  return prefs?.tradeStatus !== false;
}

/** Default-off on purpose: promoting an admin must not auto-subscribe them to another admin's review mail. */
export function isCardSubmissionEmailEnabled(
  prefs: EmailNotificationPreference | undefined,
): boolean {
  return prefs?.cardSubmissions === true;
}

/** Default-on, unlike {@link isCardSubmissionEmailEnabled}: creating the group made you the addressee of the request. */
export function isGroupJoinRequestEmailEnabled(
  prefs: EmailNotificationPreference | undefined,
): boolean {
  return prefs?.groupJoinRequests !== false;
}

/** Default-on: the recipient is waiting on this answer; without it, approval is silent until their next visit. */
export function isGroupApprovalEmailEnabled(
  prefs: EmailNotificationPreference | undefined,
): boolean {
  return prefs?.groupApprovals !== false;
}

export function getTradeRequestEmailCadence(
  prefs: EmailNotificationPreference | undefined,
): TradeRequestEmailCadence {
  return prefs?.tradeRequestCadence ?? DEFAULT_TRADE_REQUEST_EMAIL_CADENCE;
}

export interface ResolvedPreferences {
  showImages: boolean;
  fancyFan: boolean;
  foilEffect: boolean;
  cardTilt: boolean;
  theme: Theme;
  palette: Palette;
  marketplaceOrder: [Marketplace, ...Marketplace[]];
  languages: string[];
  completionScope: CompletionScopePreference;
  defaultCardView: DefaultCardView;
  defaultCurrency: Currency;
  topLevelFilters: string[];
}

/**
 * Excludes `theme`/`palette`: the theme store applies them before React
 * mounts, so they can't wait on this store's hydration.
 */
export const DISPLAY_PREFERENCE_KEYS = [
  "showImages",
  "fancyFan",
  "foilEffect",
  "cardTilt",
  "marketplaceOrder",
  "languages",
  "completionScope",
  "defaultCardView",
  "defaultCurrency",
  "topLevelFilters",
] as const satisfies readonly (keyof ResolvedPreferences)[];

export type DisplayPreferenceKey = (typeof DISPLAY_PREFERENCE_KEYS)[number];

export type DisplayPreferences = Pick<ResolvedPreferences, DisplayPreferenceKey>;

/** Null falls back to {@link PREFERENCE_DEFAULTS}. Persisted to localStorage and synced to the account. */
export type DisplayPreferenceOverrides = {
  [K in DisplayPreferenceKey]: ResolvedPreferences[K] | null;
};

export const PREFERENCE_DEFAULTS: ResolvedPreferences = {
  showImages: true,
  fancyFan: true,
  foilEffect: false,
  cardTilt: true,
  theme: "dark",
  palette: "default",
  marketplaceOrder: [...ALL_MARKETPLACES],
  languages: [WellKnown.language.EN],
  completionScope: {},
  defaultCardView: "cards",
  defaultCurrency: "EUR",
  topLevelFilters: [
    "languages",
    "sets",
    "domains",
    "rarities",
    "types",
    "superTypes",
    "variant",
    "stats",
  ],
};
