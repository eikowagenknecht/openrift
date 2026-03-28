import type { Marketplace } from "../pricing.js";

export type FoilEffect = "none" | "static" | "animated";

export interface UserPreferencesResponse {
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
  theme?: "light" | "dark";
  marketplaceOrder: Marketplace[];
}
