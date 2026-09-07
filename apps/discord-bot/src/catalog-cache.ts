import type { CardStatLabels } from "@openrift/shared/card-stat-line";
import type { VariantLabelEnumLabels } from "@openrift/shared/printing-label";
import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
} from "@openrift/shared/types/api/catalog";
import type { InitResponse } from "@openrift/shared/types/api/init";
import type { PricesResponse } from "@openrift/shared/types/api/pricing";
import { labelMap } from "@openrift/shared/utils";

export type CatalogCard = CatalogResponseCardValue & { id: string };
export type CatalogPrinting = CatalogResponsePrintingValue & { id: string };

export interface EnumLabels extends VariantLabelEnumLabels, CardStatLabels {
  deckZones: Record<string, string>;
}

export interface CatalogSnapshot {
  cards: CatalogCard[];
  printingsByCardId: Map<string, CatalogPrinting[]>;
  setsById: Map<string, CatalogSetResponse>;
  prices: PricesResponse["prices"];
  currencies: PricesResponse["currencies"];
  labels: EnumLabels;
  zoneOrder: string[];
}

interface CatalogFetchers {
  fetchCatalog: () => Promise<CatalogResponse>;
  fetchInit: () => Promise<InitResponse>;
  fetchPrices: () => Promise<PricesResponse>;
}

export function buildSnapshot(
  catalog: CatalogResponse,
  prices: PricesResponse,
  init: InitResponse,
): CatalogSnapshot {
  const cards = Object.entries(catalog.cards).map(([id, card]) => ({ id, ...card }));
  const printingsByCardId = new Map<string, CatalogPrinting[]>();
  for (const [id, printing] of Object.entries(catalog.printings)) {
    const list = printingsByCardId.get(printing.cardId) ?? [];
    list.push({ id, ...printing });
    printingsByCardId.set(printing.cardId, list);
  }
  for (const list of printingsByCardId.values()) {
    list.sort((a, b) => a.canonicalRank - b.canonicalRank);
  }
  return {
    cards,
    printingsByCardId,
    setsById: new Map(catalog.sets.map((set) => [set.id, set])),
    prices: prices.prices,
    currencies: prices.currencies,
    labels: {
      cardTypes: labelMap(init.enums.cardTypes),
      superTypes: labelMap(init.enums.superTypes),
      domains: labelMap(init.enums.domains),
      deckZones: labelMap(init.enums.deckZones),
      artVariants: labelMap(init.enums.artVariants),
      finishes: labelMap(init.enums.finishes),
      cardSizes: labelMap(init.enums.cardSizes),
    },
    zoneOrder: init.enums.deckZones
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => row.slug),
  };
}

export function representativePrinting(
  snapshot: CatalogSnapshot,
  cardId: string,
): CatalogPrinting | undefined {
  const printings = snapshot.printingsByCardId.get(cardId);
  if (!printings?.length) {
    return undefined;
  }
  return printings.find((p) => p.images.some((image) => image.face === "front")) ?? printings[0];
}

export class CatalogCache {
  readonly #fetchers: CatalogFetchers;
  #snapshot: CatalogSnapshot | null = null;

  constructor(fetchers: CatalogFetchers) {
    this.#fetchers = fetchers;
  }

  get snapshot(): CatalogSnapshot | null {
    return this.#snapshot;
  }

  /** Swaps the snapshot atomically; keeps the previous one if the fetch fails. */
  async refresh(): Promise<void> {
    const [catalog, prices, init] = await Promise.all([
      this.#fetchers.fetchCatalog(),
      this.#fetchers.fetchPrices(),
      this.#fetchers.fetchInit(),
    ]);
    this.#snapshot = buildSnapshot(catalog, prices, init);
  }
}
