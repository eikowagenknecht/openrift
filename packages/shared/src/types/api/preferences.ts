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
