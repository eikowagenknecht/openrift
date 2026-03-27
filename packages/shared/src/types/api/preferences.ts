import type { Marketplace } from "../pricing.js";

export interface UserPreferencesResponse {
  showImages: boolean;
  richEffects: boolean;
  visibleFields: {
    number: boolean;
    title: boolean;
    type: boolean;
    rarity: boolean;
    price: boolean;
  };
  theme: "light" | "dark";
  marketplaceOrder: Marketplace[];
}
