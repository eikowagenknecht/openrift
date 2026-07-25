import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The loader pulls card detail, init and prices. Only the query *keys* matter
// here — the fixtures below stand in for the real responses.
vi.mock("@/hooks/use-card-detail", () => ({
  cardDetailQueryOptions: (cardSlug: string) => ({ queryKey: ["cards", "detail", cardSlug] }),
}));
vi.mock("@/hooks/use-init", () => ({
  initQueryOptions: { queryKey: ["init"] },
}));
vi.mock("@/hooks/use-prices", () => ({
  pricesQueryOptions: { queryKey: ["prices"] },
  fetchPricesForSeo: vi.fn(() => Promise.resolve(PRICES)),
}));

const { fetchPricesForSeo } = await import("@/hooks/use-prices");
const { Route } = await import("./cards_.$cardSlug");

// One printing with prices in cents, so the loader's offer math is exercised.
const PRICES = {
  prices: { "p-en": { tcgplayer: 250, cardmarket: 199, cardtrader: 300 } },
  currencies: { tcgplayer: "USD", cardmarket: "EUR", cardtrader: "EUR" },
};

const CARD_DETAIL = {
  card: { id: "card-1", slug: "inferna", name: "Inferna", types: ["unit"] },
  printings: [{ id: "p-en", setId: "set-1" }],
  sets: [],
  products: [],
};

const INIT = { enums: { languages: [{ slug: "EN", sortOrder: 0 }], domains: [], cardTypes: [] } };

function makeContext() {
  const ensureQueryData = vi.fn((options: { queryKey: unknown[] }) => {
    const [root] = options.queryKey;
    if (root === "cards") {
      return Promise.resolve(CARD_DETAIL);
    }
    if (root === "init") {
      return Promise.resolve(INIT);
    }
    if (root === "prices") {
      return Promise.resolve(PRICES);
    }
    throw new Error(`unexpected query key: ${JSON.stringify(options.queryKey)}`);
  });
  return { queryClient: { ensureQueryData } };
}

function ensuredKeys(context: ReturnType<typeof makeContext>): string[] {
  return context.queryClient.ensureQueryData.mock.calls.map((call) => String(call[0].queryKey[0]));
}

type LoaderFn = (ctx: {
  context: ReturnType<typeof makeContext>;
  params: { cardSlug: string };
}) => Promise<{ marketplaceOffers: { seller: string; offerCount: number }[] }>;

const runLoader = (context: ReturnType<typeof makeContext>) =>
  (Route.options.loader as unknown as LoaderFn)({ context, params: { cardSlug: "inferna" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Regression: the loader used to call `ensureQueryData(pricesQueryOptions)`
// unconditionally. TanStack Start dehydrates the router's query cache into the
// SSR HTML, so that inlined the whole catalog price map — ~270 KB, 74% of the
// document — into every card page, purely to emit three JSON-LD offers. The
// server path must fetch prices outside the query client. Without the fix the
// first test here sees "prices" among the ensured keys and fails.
describe("/cards/$cardSlug loader — prices stay out of the SSR payload", () => {
  describe("on the server", () => {
    beforeEach(() => {
      vi.stubGlobal("window", undefined);
    });

    it("never writes prices into the query cache", async () => {
      const context = makeContext();

      await runLoader(context);

      expect(ensuredKeys(context)).not.toContain("prices");
    });

    it("still ensures card detail and init through the query cache", async () => {
      const context = makeContext();

      await runLoader(context);

      expect(ensuredKeys(context)).toEqual(expect.arrayContaining(["cards", "init"]));
    });

    it("fetches prices outside the query client instead", async () => {
      await runLoader(makeContext());

      expect(fetchPricesForSeo).toHaveBeenCalledTimes(1);
    });

    it("still computes the JSON-LD marketplace offers", async () => {
      const { marketplaceOffers } = await runLoader(makeContext());

      // 250 / 199 / 300 cents on the single printing, converted to major units.
      expect(marketplaceOffers).toEqual([
        { seller: "TCGplayer", currency: "USD", priceLow: 2.5, priceHigh: 2.5, offerCount: 1 },
        { seller: "Cardmarket", currency: "EUR", priceLow: 1.99, priceHigh: 1.99, offerCount: 1 },
        { seller: "CardTrader", currency: "EUR", priceLow: 3, priceHigh: 3, offerCount: 1 },
      ]);
    });

    it("falls back to no offers when the price fetch fails", async () => {
      vi.mocked(fetchPricesForSeo).mockRejectedValueOnce(new Error("upstream down"));

      const { marketplaceOffers } = await runLoader(makeContext());

      expect(marketplaceOffers).toEqual([]);
    });
  });

  // The pricing, footer and printing-picker components read prices through
  // `usePrices()`, a suspense query. On the client the loader must keep warming
  // that cache or those subtrees suspend on entry.
  describe("on the client", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {});
    });

    it("warms the prices cache through the query client", async () => {
      const context = makeContext();

      await runLoader(context);

      expect(ensuredKeys(context)).toContain("prices");
    });

    it("does not use the SSR-only price fetch", async () => {
      await runLoader(makeContext());

      expect(fetchPricesForSeo).not.toHaveBeenCalled();
    });
  });
});
