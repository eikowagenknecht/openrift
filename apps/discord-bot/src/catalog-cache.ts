import type {
  CardStatLabels,
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
  InitResponse,
  PricesResponse,
  VariantLabelEnumLabels,
} from "@openrift/shared";
import { labelMap } from "@openrift/shared";

export type CatalogCard = CatalogResponseCardValue & { id: string };
export type CatalogPrinting = CatalogResponsePrintingValue & { id: string };

/**
 * Slug → display label maps for the enum groups the embeds use. Composed from
 * the shared groups so a printing's variant label and a card's stat line are
 * named exactly as the site names them.
 */
export interface EnumLabels extends VariantLabelEnumLabels, CardStatLabels {
  deckZones: Record<string, string>;
}

export interface CatalogSnapshot {
  cards: CatalogCard[];
  /** Printings per card, sorted by canonicalRank (the display order). */
  printingsByCardId: Map<string, CatalogPrinting[]>;
  setsById: Map<string, CatalogSetResponse>;
  prices: PricesResponse["prices"];
  currencies: PricesResponse["currencies"];
  labels: EnumLabels;
  /** Deck zone slugs in display order (from the init enums). */
  zoneOrder: string[];
}

interface CatalogFetchers {
  fetchCatalog: () => Promise<CatalogResponse>;
  fetchInit: () => Promise<InitResponse>;
  fetchPrices: () => Promise<PricesResponse>;
}

/**
 * Builds the bot's lookup structures from the raw catalog + prices payloads.
 * Pure so tests can feed fixture payloads without a cache instance.
 *
 * @returns The assembled snapshot.
 */
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

/**
 * Picks the printing whose image and prices represent a card: the first by
 * canonical rank that has a front image, falling back to the first outright.
 *
 * @returns The representative printing, or undefined for a card with none.
 */
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

/**
 * In-memory cache of the public catalog and price map. The bot is stateless:
 * everything here is rebuilt from the API on startup and on every refresh.
 */
export class CatalogCache {
  readonly #fetchers: CatalogFetchers;
  #snapshot: CatalogSnapshot | null = null;

  constructor(fetchers: CatalogFetchers) {
    this.#fetchers = fetchers;
  }

  /** @returns The latest snapshot, or null before the first successful refresh. */
  get snapshot(): CatalogSnapshot | null {
    return this.#snapshot;
  }

  /**
   * Re-fetches catalog + prices and swaps the snapshot atomically. Throws on
   * fetch failure and keeps the previous snapshot, so a flaky refresh never
   * leaves the bot without data.
   */
  async refresh(): Promise<void> {
    const [catalog, prices, init] = await Promise.all([
      this.#fetchers.fetchCatalog(),
      this.#fetchers.fetchPrices(),
      this.#fetchers.fetchInit(),
    ]);
    this.#snapshot = buildSnapshot(catalog, prices, init);
  }
}
