import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
  InitResponse,
  PricesResponse,
} from "@openrift/shared";

export type CatalogCard = CatalogResponseCardValue & { id: string };
export type CatalogPrinting = CatalogResponsePrintingValue & { id: string };

/** Slug → display label maps for the enum groups the embed's stat line uses. */
export interface EnumLabels {
  cardTypes: Record<string, string>;
  superTypes: Record<string, string>;
  domains: Record<string, string>;
}

export interface CatalogSnapshot {
  cards: CatalogCard[];
  /** Printings per card, sorted by canonicalRank (the display order). */
  printingsByCardId: Map<string, CatalogPrinting[]>;
  setsById: Map<string, CatalogSetResponse>;
  prices: PricesResponse["prices"];
  currencies: PricesResponse["currencies"];
  labels: EnumLabels;
}

interface CatalogFetchers {
  fetchCatalog: () => Promise<CatalogResponse>;
  fetchInit: () => Promise<InitResponse>;
  fetchPrices: () => Promise<PricesResponse>;
}

function labelMap(rows: readonly { slug: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.slug, row.label]));
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
    },
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
  #fetchers: CatalogFetchers;
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
