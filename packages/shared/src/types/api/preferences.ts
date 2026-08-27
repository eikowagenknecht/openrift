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
 * Orthogonal to Theme: Theme picks the light/dark scheme, Palette picks the
 * variable set inside it. Adding a palette = a `[data-palette="X"]` block plus
 * a `.dark[data-palette="X"]` block in index.css, plus an entry here.
 * @see PALETTES
 */
export type Palette = (typeof PALETTES)[number];

export const PALETTES = ["default", "minimal"] as const;

export type DefaultCardView = "cards" | "printings";

/**
 * Stored preferences — all fields optional.
 * Missing fields use `PREFERENCE_DEFAULTS` at read time.
 */
/** Scope filters for collection completion tracking. */
export type CompletionScopePreference = z.infer<typeof completionScopePreferenceSchema>;

type CompletionScopeKey = keyof CompletionScopePreference;

/** How a scope axis travels: `array` carries a list of values, `scalar` one. */
type ScopeKeyKind = "array" | "scalar";

/**
 * How each scope axis travels. Callers fold a whole scope by walking the two
 * lists below — into query params, or into a "is anything set?" test — so an
 * axis missing from them silently drops out of every one of those at once. The
 * `satisfies` is the guard: a field added to `completionScopeFields` fails the
 * build here until it is classified. Classified once, in this one place; two
 * hooks used to keep private copies and both claimed to be the source.
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

/**
 * Narrows {@link COMPLETION_SCOPE_KEY_KINDS} to the axes of one transport kind.
 * @returns Those keys, in declaration order.
 */
function scopeKeysOfKind<K extends ScopeKeyKind>(kind: K): readonly ScopeKeysOfKind<K>[] {
  const keys = Object.keys(COMPLETION_SCOPE_KEY_KINDS) as CompletionScopeKey[];
  return keys.filter((key) => COMPLETION_SCOPE_KEY_KINDS[key] === kind) as ScopeKeysOfKind<K>[];
}

/** Every array-valued scope axis, include and exclude alike. */
export const COMPLETION_SCOPE_ARRAY_KEYS = scopeKeysOfKind("array");

/** The single-valued scope axes: tri-state flags and presence states. */
export const COMPLETION_SCOPE_SCALAR_KEYS = scopeKeysOfKind("scalar");

/**
 * Stored preferences — every field optional; missing fields resolve to
 * `PREFERENCE_DEFAULTS`. `emailNotifications` carries the ADR-030 opt-ins whose
 * two channels have *different* defaults (digest off, request on), encoded in
 * the read-side gates below rather than the stored data.
 */
export type UserPreferencesResponse = z.infer<typeof userPreferencesResponseSchema>;

/**
 * How often trade-request emails are delivered to a recipient (ADR-030).
 * `instant` sends every request right away; the `Nmin` values debounce a burst
 * into one email sent N minutes after the last request.
 */
export const TRADE_REQUEST_EMAIL_CADENCES = ["instant", "5min", "15min", "30min", "60min"] as const;
export type TradeRequestEmailCadence = (typeof TRADE_REQUEST_EMAIL_CADENCES)[number];

/** Minutes each cadence maps to (`instant` = 0 = no debounce). */
export const TRADE_REQUEST_EMAIL_CADENCE_MINUTES: Record<TradeRequestEmailCadence, number> = {
  instant: 0,
  "5min": 5,
  "15min": 15,
  "30min": 30,
  "60min": 60,
};

/** Cadence applied when the recipient hasn't chosen one (and for existing users). */
export const DEFAULT_TRADE_REQUEST_EMAIL_CADENCE: TradeRequestEmailCadence = "5min";

/**
 * Per-channel transactional email opt-ins (ADR-030). `tradeMatches`/`tradeRequests`
 * are booleans; `tradeStatus` (accepted/declined/cancelled emails) is opt-out
 * (on unless explicitly `false`); `tradeRequestCadence` sets delivery cadence for
 * trade-request *and* trade-status emails (absent = {@link DEFAULT_TRADE_REQUEST_EMAIL_CADENCE}).
 */
export type EmailNotificationPreference = z.infer<typeof emailNotificationPreferenceSchema>;

/**
 * Email-notification channel keys, used for unsubscribe links and toggles. Pinned
 * to the boolean opt-in keys (not `keyof EmailNotificationPreference`) so the
 * non-boolean cadence field stays out of the on/off toggle path.
 */
export type EmailNotificationChannel =
  | "tradeMatches"
  | "tradeRequests"
  | "tradeStatus"
  | "cardSubmissions"
  | "groupJoinRequests";

/**
 * Human-readable label per channel, phrased to slot into "You'll no longer
 * receive {label}." / "Unsubscribe from {label}?". Shared so the unsubscribe
 * page, the API, and email copy never drift.
 */
export const EMAIL_NOTIFICATION_CHANNEL_LABELS: Record<EmailNotificationChannel, string> = {
  tradeMatches: "the daily match digest",
  tradeRequests: "trade-request emails",
  tradeStatus: "trade status updates",
  cardSubmissions: "card submission alerts",
  groupJoinRequests: "group join requests",
};

/** @returns Whether the daily match digest is enabled (opt-in: default off). */
export function isTradeMatchDigestEnabled(prefs: EmailNotificationPreference | undefined): boolean {
  return prefs?.tradeMatches === true;
}

/** @returns Whether the trade-request email is enabled (opt-out: default on). */
export function isTradeRequestEmailEnabled(
  prefs: EmailNotificationPreference | undefined,
): boolean {
  return prefs?.tradeRequests !== false;
}

/** @returns Whether trade status-change emails are enabled (opt-out: default on). */
export function isTradeStatusEmailEnabled(prefs: EmailNotificationPreference | undefined): boolean {
  return prefs?.tradeStatus !== false;
}

/**
 * Whether the admin card-submission alert is enabled (opt-in: default off).
 * Default-off on purpose — a second admin should never start receiving another
 * admin's review mail just by being promoted (ADR-036).
 * @returns Whether the alert is enabled.
 */
export function isCardSubmissionEmailEnabled(
  prefs: EmailNotificationPreference | undefined,
): boolean {
  return prefs?.cardSubmissions === true;
}

/**
 * Whether the group join-request alert is enabled (opt-out: default on).
 * Default-on unlike {@link isCardSubmissionEmailEnabled}, because you become a
 * group admin by creating the group, and the request is addressed to you.
 * @returns Whether the alert is enabled.
 */
export function isGroupJoinRequestEmailEnabled(
  prefs: EmailNotificationPreference | undefined,
): boolean {
  return prefs?.groupJoinRequests !== false;
}

/** @returns The recipient's trade-request email cadence (default when unset). */
export function getTradeRequestEmailCadence(
  prefs: EmailNotificationPreference | undefined,
): TradeRequestEmailCadence {
  return prefs?.tradeRequestCadence ?? DEFAULT_TRADE_REQUEST_EMAIL_CADENCE;
}

/** Fully resolved preferences — no optional fields. */
export interface ResolvedPreferences {
  showImages: boolean;
  fancyFan: boolean;
  foilEffect: boolean;
  cardTilt: boolean;
  theme: Theme;
  palette: Palette;
  marketplaceOrder: Marketplace[];
  languages: string[];
  completionScope: CompletionScopePreference;
  defaultCardView: DefaultCardView;
  defaultCurrency: Currency;
  /**
   * Filter placement units shown at the top level of the card-browser filter
   * chrome; every other unit lives in the "More" group. Unit keys are defined
   * in the web app (`apps/web/src/lib/filter-sections.ts`). Replaces the
   * retired `hiddenFilterSections` preference.
   */
  topLevelFilters: string[];
}

/** Default values for every preference. Used to resolve missing/null fields. */
export const PREFERENCE_DEFAULTS: ResolvedPreferences = {
  showImages: true,
  fancyFan: true,
  foilEffect: false,
  cardTilt: true,
  theme: "auto",
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
