export interface CardFields {
  number: boolean;
  title: boolean;
  type: boolean;
  rarity: boolean;
  price: boolean;
}

export const DEFAULT_CARD_FIELDS: CardFields = {
  number: true,
  title: true,
  type: true,
  rarity: true,
  price: true,
};
