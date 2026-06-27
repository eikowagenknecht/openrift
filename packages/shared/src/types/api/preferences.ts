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
export interface CompletionScopePreference {
  sets?: string[];
  languages?: string[];
  domains?: string[];
  types?: string[];
  rarities?: string[];
  finishes?: string[];
  artVariants?: string[];
  /** Tri-state: undefined = all, "only" = promos only, "exclude" = no promos. */
  promos?: "only" | "exclude";
  /** Tri-state boolean filters: true = only, false = exclude, undefined = all. */
  signed?: boolean;
  banned?: boolean;
  errata?: boolean;
}

export interface UserPreferencesResponse {
  showImages?: boolean;
  fancyFan?: boolean;
  foilEffect?: boolean;
  cardTilt?: boolean;
  theme?: Theme;
  palette?: Palette;
  marketplaceOrder?: Marketplace[];
  languages?: string[];
  completionScope?: CompletionScopePreference;
  defaultCardView?: DefaultCardView;
  /** Default currency for new wish/trade lists (ADR-017). Falls back to EUR. */
  defaultCurrency?: Currency;
  /**
   * Filter-panel sections the user has chosen to hide across every
   * card-browser surface. Unioned with each surface's own contextual hides.
   * Empty/missing = every applicable section is shown (the default).
   */
  hiddenFilterSections?: string[];
  /**
   * Transactional email opt-ins (ADR-030). The two channels carry *different*
   * defaults, encoded in the read-side gate, not the stored data:
   * - `tradeMatches` (daily match digest) is OFF unless explicitly `true`.
   * - `tradeRequests` (instant trade-request email) is ON unless explicitly `false`.
   * An absent `emailNotifications` therefore means "digest off, request on",
   * which is why existing users need no backfill.
   */
  emailNotifications?: EmailNotificationPreference;
}

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

/** Per-channel transactional email opt-ins (ADR-030). */
export interface EmailNotificationPreference {
  tradeMatches?: boolean;
  tradeRequests?: boolean;
  /**
   * Trade status-change emails (accepted / declined / cancelled), sent to the
   * party who didn't take the action. Opt-out: on unless explicitly `false`.
   * Shares the trade-request cadence ({@link tradeRequestCadence}).
   */
  tradeStatus?: boolean;
  /**
   * Delivery cadence for trade-request *and* trade-status emails; absent =
   * {@link DEFAULT_TRADE_REQUEST_EMAIL_CADENCE}.
   */
  tradeRequestCadence?: TradeRequestEmailCadence;
}

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
  hiddenFilterSections: string[];
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
  hiddenFilterSections: [],
};
