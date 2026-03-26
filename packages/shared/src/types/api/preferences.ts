export interface UserPreferencesResponse {
  showImages: boolean;
  richEffects: boolean;
  cardFields: {
    number: boolean;
    title: boolean;
    type: boolean;
    rarity: boolean;
    price: boolean;
  };
  theme: "light" | "dark";
}
