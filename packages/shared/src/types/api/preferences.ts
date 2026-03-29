import { ALL_MARKETPLACES } from "../pricing.js";
import type { Marketplace } from "../pricing.js";

export type FoilEffect = "none" | "static" | "animated";
export type Theme = "light" | "dark" | "auto";

/**
 * Stored preferences — all fields optional.
 * Missing fields use `PREFERENCE_DEFAULTS` at read time.
 */
export interface UserPreferencesResponse {
  showImages?: boolean;
  fancyFan?: boolean;
  foilEffect?: FoilEffect;
  cardTilt?: boolean;
  visibleFields?: {
    number?: boolean;
    title?: boolean;
    type?: boolean;
    rarity?: boolean;
    price?: boolean;
  };
  theme?: Theme;
  marketplaceOrder?: Marketplace[];
}

/** Fully resolved preferences — no optional fields. */
export interface ResolvedPreferences {
  showImages: boolean;
  fancyFan: boolean;
  foilEffect: FoilEffect;
  cardTilt: boolean;
  visibleFields: {
    number: boolean;
    title: boolean;
    type: boolean;
    rarity: boolean;
    price: boolean;
  };
  theme: Theme;
  marketplaceOrder: Marketplace[];
}

/** Default values for every preference. Used to resolve missing/null fields. */
export const PREFERENCE_DEFAULTS: ResolvedPreferences = {
  showImages: true,
  fancyFan: true,
  foilEffect: "animated",
  cardTilt: true,
  visibleFields: { number: true, title: true, type: true, rarity: true, price: true },
  theme: "auto",
  marketplaceOrder: [...ALL_MARKETPLACES],
};
