import { ALL_MARKETPLACES } from "../pricing.js";
import type { Marketplace } from "../pricing.js";

export type Theme = "light" | "dark" | "auto";

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
  marketplaceOrder?: Marketplace[];
  languages?: string[];
  completionScope?: CompletionScopePreference;
  defaultCardView?: DefaultCardView;
}

/** Fully resolved preferences — no optional fields. */
export interface ResolvedPreferences {
  showImages: boolean;
  fancyFan: boolean;
  foilEffect: boolean;
  cardTilt: boolean;
  theme: Theme;
  marketplaceOrder: Marketplace[];
  languages: string[];
  completionScope: CompletionScopePreference;
  defaultCardView: DefaultCardView;
}

/** Default values for every preference. Used to resolve missing/null fields. */
export const PREFERENCE_DEFAULTS: ResolvedPreferences = {
  showImages: true,
  fancyFan: true,
  foilEffect: false,
  cardTilt: true,
  theme: "auto",
  marketplaceOrder: [...ALL_MARKETPLACES],
  languages: ["EN"],
  completionScope: {},
  defaultCardView: "printings",
};
