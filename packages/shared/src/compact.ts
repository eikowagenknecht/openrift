import type { Card, CatalogPrinting, RiftboundCatalog } from "./types/index.js";

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === null) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function compactCatalog(catalog: RiftboundCatalog): RiftboundCatalog {
  return {
    sets: catalog.sets,
    cards: Object.fromEntries(
      Object.entries(catalog.cards).map(([id, card]) => [
        id,
        compact(card as unknown as Record<string, unknown>),
      ]),
    ) as unknown as Record<string, Card>,
    printings: catalog.printings.map(
      (p) => compact(p as unknown as Record<string, unknown>) as unknown as CatalogPrinting,
    ),
  };
}

const CARD_DEFAULTS: Pick<
  Card,
  "might" | "energy" | "power" | "mightBonus" | "rulesText" | "effectText"
> = {
  might: null,
  energy: null,
  power: null,
  mightBonus: null,
  rulesText: null,
  effectText: null,
};

const CARD_ARRAY_DEFAULTS: Pick<Card, "superTypes" | "keywords" | "tags"> = {
  superTypes: [],
  keywords: [],
  tags: [],
};

const PRINTING_DEFAULTS: Pick<
  CatalogPrinting,
  "printedRulesText" | "printedEffectText" | "flavorText"
> = {
  printedRulesText: null,
  printedEffectText: null,
  flavorText: null,
};

const PRINTING_ARRAY_DEFAULTS: Pick<CatalogPrinting, "images"> = {
  images: [],
};

export function hydrateCatalog(raw: RiftboundCatalog): RiftboundCatalog {
  const cards: Record<string, Card> = {};
  for (const [id, card] of Object.entries(raw.cards)) {
    cards[id] = { ...CARD_DEFAULTS, ...CARD_ARRAY_DEFAULTS, ...card };
  }

  const printings: CatalogPrinting[] = raw.printings.map((p) => ({
    ...PRINTING_DEFAULTS,
    ...PRINTING_ARRAY_DEFAULTS,
    ...p,
  }));

  return { sets: raw.sets, cards, printings };
}
