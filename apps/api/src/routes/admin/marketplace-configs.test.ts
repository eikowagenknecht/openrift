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
    snapshotsByMarketplace: vi.fn().mockResolvedValue([]),
    insertSnapshot: vi.fn().mockResolvedValue(undefined),
    insertStagingFromSnapshot: vi.fn().mockResolvedValue(undefined),
    bulkUnmapToStaging: vi.fn().mockResolvedValue(undefined),
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
    const repos = { marketplaceTransfer: repo } as unknown as Repos;
    const configs = createMarketplaceConfigs(repos);

    expect(configs).toHaveProperty("tcgplayer");
    expect(configs).toHaveProperty("cardmarket");
    expect(configs).toHaveProperty("cardtrader");
  });

  describe("tcgplayer config", () => {
    it("has marketplace set to tcgplayer", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      expect(tcgplayer.marketplace).toBe("tcgplayer");
      expect(tcgplayer.currency).toBe("USD");
    });

    it("mapStagingPrices returns all price columns with USD currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      const result = tcgplayer.mapStagingPrices({
        ...priceRow,
        externalId: 1,
        groupId: 1,
        productName: "Test",
        finish: "normal",
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

    it("snapshotQuery delegates to repo.snapshotsByMarketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      await tcgplayer.snapshotQuery(["p-1", "p-2"]);

      expect(repo.snapshotsByMarketplace).toHaveBeenCalledWith("tcgplayer", ["p-1", "p-2"]);
    });

    it("mapSnapshotPrices includes productName and recordedAt", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      const date = new Date("2026-01-15T10:00:00Z");
      const result = tcgplayer.mapSnapshotPrices({
        ...priceRow,
        printingId: "p-1",
        productName: "Snapshot Product",
        recordedAt: date,
      });

      expect(result.productName).toBe("Snapshot Product");
      expect(result.recordedAt).toBe(date.toISOString());
      expect(result.currency).toBe("USD");
    });

    it("insertSnapshot delegates to repo.insertSnapshot", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      const row = {
        ...priceRow,
        externalId: 1,
        groupId: 1,
        productName: "Test",
        finish: "normal",
        recordedAt: new Date(),
      };
      await tcgplayer.insertSnapshot("product-1", row);

      expect(repo.insertSnapshot).toHaveBeenCalledWith("product-1", row);
    });

    it("insertStagingFromSnapshot delegates with marketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      const ps = { externalId: 1, groupId: 1, productName: "Test" };
      const snap = { ...priceRow, recordedAt: new Date() };
      await tcgplayer.insertStagingFromSnapshot(ps, "normal", "EN", snap);

      expect(repo.insertStagingFromSnapshot).toHaveBeenCalledWith(
        "tcgplayer",
        ps,
        "normal",
        "EN",
        snap,
      );
    });

    it("bulkUnmapSql delegates to repo.bulkUnmapToStaging", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { tcgplayer } = createMarketplaceConfigs(repos);

      await tcgplayer.bulkUnmapSql();

      expect(repo.bulkUnmapToStaging).toHaveBeenCalledWith("tcgplayer");
    });
  });

  describe("cardmarket config", () => {
    it("has marketplace set to cardmarket with EUR currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardmarket } = createMarketplaceConfigs(repos);

      expect(cardmarket.marketplace).toBe("cardmarket");
      expect(cardmarket.currency).toBe("EUR");
    });

    it("mapStagingPrices returns EUR currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardmarket } = createMarketplaceConfigs(repos);

      const result = cardmarket.mapStagingPrices({
        ...priceRow,
        externalId: 1,
        groupId: 1,
        productName: "Test",
        finish: "normal",
        recordedAt: new Date(),
      });

      expect(result.currency).toBe("EUR");
    });

    it("snapshotQuery delegates with cardmarket marketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardmarket } = createMarketplaceConfigs(repos);

      await cardmarket.snapshotQuery(["p-1"]);

      expect(repo.snapshotsByMarketplace).toHaveBeenCalledWith("cardmarket", ["p-1"]);
    });

    it("insertStagingFromSnapshot delegates with cardmarket marketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardmarket } = createMarketplaceConfigs(repos);

      const ps = { externalId: 1, groupId: 1, productName: "Test" };
      const snap = { ...priceRow, recordedAt: new Date() };
      await cardmarket.insertStagingFromSnapshot(ps, "foil", "EN", snap);

      expect(repo.insertStagingFromSnapshot).toHaveBeenCalledWith(
        "cardmarket",
        ps,
        "foil",
        "EN",
        snap,
      );
    });

    it("bulkUnmapSql delegates with cardmarket marketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardmarket } = createMarketplaceConfigs(repos);

      await cardmarket.bulkUnmapSql();

      expect(repo.bulkUnmapToStaging).toHaveBeenCalledWith("cardmarket");
    });
  });

  describe("cardtrader config", () => {
    it("has marketplace set to cardtrader with EUR currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardtrader } = createMarketplaceConfigs(repos);

      expect(cardtrader.marketplace).toBe("cardtrader");
      expect(cardtrader.currency).toBe("EUR");
    });

    it("mapStagingPrices returns EUR currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardtrader } = createMarketplaceConfigs(repos);

      const result = cardtrader.mapStagingPrices({
        ...priceRow,
        externalId: 1,
        groupId: 1,
        productName: "Test",
        finish: "normal",
        recordedAt: new Date(),
      });

      expect(result.currency).toBe("EUR");
    });

    it("snapshotQuery delegates with cardtrader marketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardtrader } = createMarketplaceConfigs(repos);

      await cardtrader.snapshotQuery(["p-1"]);

      expect(repo.snapshotsByMarketplace).toHaveBeenCalledWith("cardtrader", ["p-1"]);
    });

    it("bulkUnmapSql delegates with cardtrader marketplace", async () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardtrader } = createMarketplaceConfigs(repos);

      await cardtrader.bulkUnmapSql();

      expect(repo.bulkUnmapToStaging).toHaveBeenCalledWith("cardtrader");
    });

    it("mapSnapshotPrices includes EUR currency", () => {
      const repo = createMockTransferRepo();
      const repos = { marketplaceTransfer: repo } as unknown as Repos;
      const { cardtrader } = createMarketplaceConfigs(repos);

      const result = cardtrader.mapSnapshotPrices({
        ...priceRow,
        printingId: "p-1",
        productName: "CT Product",
        recordedAt: new Date("2026-01-15"),
      });

      expect(result.currency).toBe("EUR");
      expect(result.productName).toBe("CT Product");
    });
  });
});
