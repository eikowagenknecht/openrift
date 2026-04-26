import { describe, expect, it, vi } from "vitest";

import { createRepos, createTransact, services } from "./deps.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRepos", () => {
  it("returns an object with all expected repo keys", () => {
    const mockDb = {} as any;
    const repos = createRepos(mockDb);

    const expectedKeys = [
      "collectionEvents",
      "admins",
      "candidateMutations",
      "candidateCards",
      "catalog",
      "collections",
      "copies",
      "decks",
      "featureFlags",
      "health",
      "keywords",
      "ignoredCandidates",
      "marketplace",
      "marketplaceAdmin",
      "printingImages",
      "markers",
      "distributionChannels",
      "sets",
      "providerSettings",
      "siteSettings",
      "tradeLists",
      "userPreferences",
      "wishLists",
      "ingest",
      "marketplaceMapping",
      "priceRefresh",
    ];
    for (const key of expectedKeys) {
      expect(repos).toHaveProperty(key);
    }
  });
});

describe("createTransact", () => {
  it("executes the callback within a transaction and returns the result", async () => {
    const mockTrx = {} as any;
    const mockExecute = vi.fn((callback: (trx: any) => Promise<unknown>) => callback(mockTrx));
    const mockTransaction = vi.fn(() => ({ execute: mockExecute }));
    const mockDb = { transaction: mockTransaction } as any;

    const transact = createTransact(mockDb);
    const result = await transact(async (repos) => {
      // repos should be created from the transaction connection
      expect(repos).toBeDefined();
      return "transaction-result";
    });

    expect(result).toBe("transaction-result");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe("services", () => {
  it("exports all expected service functions", () => {
    const expectedKeys = [
      "ensureInbox",
      "logEvents",
      "deleteCollection",
      "addCopies",
      "moveCopies",
      "disposeCopies",
      "buildShoppingList",
      "getMappingOverview",
      "ingestCandidates",
      "importErrata",
    ];
    for (const key of expectedKeys) {
      expect(services).toHaveProperty(key);
      expect(typeof (services as any)[key]).toBe("function");
    }
  });
});
