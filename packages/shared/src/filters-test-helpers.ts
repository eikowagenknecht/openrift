import { makePrinting as stubPrinting } from "./test-factories.js";
import type { Card, Printing } from "./types/catalog.js";
import type { EnumOrders } from "./types/enums.js";
import type { CardFilters } from "./types/search.js";
import { EMPTY_CARD_FILTERS } from "./types/search.js";

export const TEST_ORDERS: EnumOrders = {
  domains: ["fury", "calm", "mind", "body", "chaos", "order", "colorless"],
  rarities: ["common", "uncommon", "rare", "epic", "showcase"],
  artVariants: ["normal", "altart", "ultimate"],
  cardTypes: ["legend", "unit", "rune", "spell", "gear", "battlefield", "other"],
  superTypes: ["basic", "champion", "signature", "token"],
  finishes: ["normal", "foil", "metal", "metal-deluxe"],
  cardSizes: ["standard", "oversized"],
};

// Prices aren't on `Printing`; tests inject them via a WeakMap keyed by
// identity, read through the `getPrice` option.
const TEST_PRICES = new WeakMap<Printing, number>();
export function withPrice(printing: Printing, price: number): Printing {
  TEST_PRICES.set(printing, price);
  return printing;
}
export const getTestPrice = (p: Printing): number | undefined => TEST_PRICES.get(p);

export function makePrinting(
  overrides: Omit<Partial<Printing>, "card"> & { card?: Partial<Card> } = {},
): Printing {
  const { card, ...printing } = overrides;
  return stubPrinting({
    id: "00000000-0000-0000-0000-000000000001",
    cardId: "00000000-0000-0000-0000-000000000001",
    shortCode: "SET1-001",
    setId: "00000000-0000-0000-0000-0000000000a1",
    setSlug: "Set Alpha",
    images: [{ face: "front", imageId: "019d6c25-b081-74b3-a901-64da4ae01dab" }],
    artist: "Jane Doe",
    publicCode: "ABCD",
    card: {
      slug: "SET1-001",
      domains: ["fury"],
      energy: 3,
      might: 2,
      power: 4,
      keywords: ["Shield"],
      tags: ["Warrior"],
      mightBonus: 0,
      ...card,
    },
    ...printing,
  });
}

export function emptyFilters(overrides: Partial<CardFilters> = {}): CardFilters {
  return {
    ...EMPTY_CARD_FILTERS,
    searchScope: ["name"],
    ...overrides,
  };
}
