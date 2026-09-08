import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/cards/hooks/use-card-detail", () => ({
  cardDetailQueryOptions: (cardSlug: string) => ({ queryKey: ["cards", "detail", cardSlug] }),
}));
vi.mock("@/hooks/use-init", () => ({
  initQueryOptions: { queryKey: ["init"] },
}));
vi.mock("@/features/cards/hooks/use-prices", () => ({
  pricesQueryOptions: { queryKey: ["prices"] },
  fetchPricesForSeo: vi.fn(() => Promise.resolve(PRICES)),
}));

const { fetchPricesForSeo } = await import("@/features/cards/hooks/use-prices");
const { Route } = await import("./cards_.$cardSlug.{-$printingSlug}");

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
  const query = vi.fn((options: { queryKey: unknown[] }) => {
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
  return { queryClient: { query } };
}

function ensuredKeys(context: ReturnType<typeof makeContext>): string[] {
  return context.queryClient.query.mock.calls.map((call) => String(call[0].queryKey[0]));
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

      expect(marketplaceOffers).toEqual([
        { seller: "CardTrader", currency: "EUR", priceLow: 3, priceHigh: 3, offerCount: 1 },
        { seller: "TCGplayer", currency: "USD", priceLow: 2.5, priceHigh: 2.5, offerCount: 1 },
        { seller: "Cardmarket", currency: "EUR", priceLow: 1.99, priceHigh: 1.99, offerCount: 1 },
      ]);
    });

    it("falls back to no offers when the price fetch fails", async () => {
      vi.mocked(fetchPricesForSeo).mockRejectedValueOnce(new Error("upstream down"));

      const { marketplaceOffers } = await runLoader(makeContext());

      expect(marketplaceOffers).toEqual([]);
    });
  });

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
