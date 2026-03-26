export interface VisibleFields {
  number: boolean;
  title: boolean;
  type: boolean;
  rarity: boolean;
  price: boolean;
}

export const DEFAULT_VISIBLE_FIELDS: VisibleFields = {
  number: true,
  title: true,
  type: true,
  rarity: true,
  price: true,
};
