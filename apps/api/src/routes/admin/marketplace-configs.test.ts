/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps.js";
import { createMarketplaceConfigs } from "./marketplace-configs.js";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

function createMockTransferRepo() {
  return {
    pricesByMarketplace: vi.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const priceRow = {
  marketCents: 500,
  lowCents: 400,
  midCents: 450,
  highCents: 600,
  trendCents: 480,
  avg1Cents: 490,
  avg7Cents: 495,
  avg30Cents: 498,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createMarketplaceConfigs", () => {
  it("returns tcgplayer, cardmarket, and cardtrader configs", () => {
    const repo = createMockTransferRepo();
    const repos = { marketplaceMapping: repo } as unknown as Repos;
    const configs = createMarketplaceConfigs(repos);

    expect(configs).toHaveProperty("tcgplayer");
    expect(configs).toHaveProperty("cardmarket");
    expect(configs).toHaveProperty("cardtrader");
  });

  describe("tcgplayer config", () => {
    it("has marketplace set to tcgplayer", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      expect(tcgplayer.marketplace).toBe("tcgplayer");
      expect(tcgplayer.currency).toBe("USD");
    });

    it("mapStagingPrices returns all price columns with USD currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      const result = tcgplayer.mapStagingPrices({
        ...priceRow,
        zeroLowCents: null,
        externalId: 1,
        groupId: 1,
        productName: "Test",
        finish: "normal",
        language: null,
        recordedAt: new Date(),
      });

      expect(result.currency).toBe("USD");
      expect(result.marketCents).toBe(500);
      expect(result.lowCents).toBe(400);
      expect(result.midCents).toBe(450);
      expect(result.highCents).toBe(600);
      expect(result.trendCents).toBe(480);
      expect(result.avg1Cents).toBe(490);
      expect(result.avg7Cents).toBe(495);
      expect(result.avg30Cents).toBe(498);
    });

    it("priceQuery delegates to repo.pricesByMarketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      await tcgplayer.priceQuery(["p-1", "p-2"]);

      expect(repo.pricesByMarketplace).toHaveBeenCalledWith("tcgplayer", ["p-1", "p-2"]);
    });

    it("mapPriceRow includes productName and recordedAt", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      const date = new Date("2026-01-15T10:00:00Z");
      const result = tcgplayer.mapPriceRow({
        ...priceRow,
        externalId: 1,
        printingId: "p-1",
        productName: "Price Row",
        recordedAt: date,
      });

      expect(result.productName).toBe("Price Row");
      expect(result.recordedAt).toBe(date.toISOString());
      expect(result.currency).toBe("USD");
    });
  });

  describe("cardmarket config", () => {
    it("has marketplace set to cardmarket with EUR currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { cardmarket } = createMarketplaceConfigs(repos);

      expect(cardmarket.marketplace).toBe("cardmarket");
      expect(cardmarket.currency).toBe("EUR");
    });

    it("priceQuery delegates with cardmarket marketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { cardmarket } = createMarketplaceConfigs(repos);

      await cardmarket.priceQuery(["p-1"]);

      expect(repo.pricesByMarketplace).toHaveBeenCalledWith("cardmarket", ["p-1"]);
    });
  });

  describe("cardtrader config", () => {
    it("has marketplace set to cardtrader with EUR currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { cardtrader } = createMarketplaceConfigs(repos);

      expect(cardtrader.marketplace).toBe("cardtrader");
      expect(cardtrader.currency).toBe("EUR");
    });

    it("priceQuery delegates with cardtrader marketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { cardtrader } = createMarketplaceConfigs(repos);

      await cardtrader.priceQuery(["p-1"]);

      expect(repo.pricesByMarketplace).toHaveBeenCalledWith("cardtrader", ["p-1"]);
    });

    it("mapPriceRow includes EUR currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceMapping: repo } as unknown as Repos;
      const { cardtrader } = createMarketplaceConfigs(repos);

      const result = cardtrader.mapPriceRow({
        ...priceRow,
        externalId: 1,
        printingId: "p-1",
        productName: "CT Product",
        recordedAt: new Date("2026-01-15"),
      });

      expect(result.currency).toBe("EUR");
      expect(result.productName).toBe("CT Product");
    });
  });
});
