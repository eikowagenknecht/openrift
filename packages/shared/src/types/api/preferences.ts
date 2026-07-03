import type {
  completionScopePreferenceSchema,
  emailNotificationPreferenceSchema,
  userPreferencesResponseSchema,
} from "@openrift/shared/contracts/preferences";
import type { z } from "zod";

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
export type EmailNotificationChannel = "tradeMatches" | "tradeRequests" | "tradeStatus";

/**
 * Human-readable label per channel, phrased to slot into "You'll no longer
 * receive {label}." / "Unsubscribe from {label}?". Shared so the unsubscribe
 * page, the API, and email copy never drift.
 */
export const EMAIL_NOTIFICATION_CHANNEL_LABELS: Record<EmailNotificationChannel, string> = {
  tradeMatches: "the daily match digest",
  tradeRequests: "trade-request emails",
  tradeStatus: "trade status updates",
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
  languages: ["EN"],
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
