/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import type { Logger } from "@openrift/shared/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps.js";
import type { Fetch } from "../../io.js";
import { refreshCardtraderPrices } from "./cardtrader.js";
import * as logMod from "./log.js";
import type { StagingRow, UpsertCounts } from "./types.js";
import * as upsertMod from "./upsert.js";

// ── Stub fetch ──────────────────────────────────────────────────────────

const _stubFetch: Fetch = (() => {
  throw new Error("unexpected real fetch");
}) as unknown as Fetch;

// ── Mock data ───────────────────────────────────────────────────────────

const EXPANSION_A = { id: 1001, game_id: 22, code: "OGN", name: "Origins" };
const EXPANSION_B = { id: 1002, game_id: 22, code: "EXP", name: "Expansion" };
const EXPANSION_OTHER_GAME = { id: 9999, game_id: 99, code: "OTHER", name: "Other Game" };

const BLUEPRINT_FLAME = {
  id: 5001,
  name: "Flame Striker",
  category_id: 258,
  expansion_id: 1001,
  card_market_ids: [8001],
  tcg_player_id: 7001,
};

const BLUEPRINT_ICE = {
  id: 5002,
  name: "Ice Shard",
  category_id: 258,
  expansion_id: 1001,
  card_market_ids: [],
  tcg_player_id: null,
};

const BLUEPRINT_SEALED = {
  id: 5003,
  name: "Booster Pack",
  category_id: 999,
  expansion_id: 1001,
  card_market_ids: [],
  tcg_player_id: null,
};

const ZERO_COUNTS: UpsertCounts = {
  snapshots: { total: 0, new: 0, updated: 0, unchanged: 0 },
  staging: { total: 0, new: 0, updated: 0, unchanged: 0 },
};

// ── Helpers ─────────────────────────────────────────────────────────────

function makeMockLogger(): { log: Logger; messages: string[] } {
  const messages: string[] = [];
  const log = {
    info: (msg: string) => messages.push(msg),
  } as unknown as Logger;
  return { log, messages };
}

interface MockPrinting {
  id: string;
  cardId: string;
  setId: string;
  shortCode: string;
  publicCode?: string;
  finish: string;
  artVariant?: string;
  isSigned?: boolean;
  language?: string;
  markerSlugs?: string[];
}

interface MockReposConfig {
  ignoredProducts?: { externalId: number; finish?: string; language?: string }[];
  existingSources?: {
    marketplace: string;
    externalId: number;
    printingId: string;
    finish?: string;
    language?: string;
    groupId: number;
    productName: string;
  }[];
  existingCtExternalIds?: number[];
  /**
   * Printings to return from `allPrintingsForPriceMatch`. When a test wires
   * up `existingSources` whose `printingId` is present here, the sibling
   * lookup can find Chinese (or other-language) counterparts. Defaults to
   * the printings referenced by `existingSources` as English printings so
   * legacy tests keep working without each having to declare printings.
   */
  printings?: MockPrinting[];
}

function createMockRepos(config: MockReposConfig = {}) {
  const productIds = new Set<number>();
  const variantKeys = new Set<string>();
  for (const p of config.ignoredProducts ?? []) {
    if (p.finish === undefined) {
      productIds.add(p.externalId);
    } else {
      variantKeys.add(`${p.externalId}::${p.finish}::${p.language ?? "EN"}`);
    }
  }
  const ignoredKeys = { productIds, variantKeys };

  // Expand defaults on existing sources (new shape has finish + language).
  const existingSources = (config.existingSources ?? []).map((s) => ({
    finish: "normal",
    language: "EN",
    ...s,
  }));

  // If no printings were declared, synthesize an English printing for every
  // cross-ref source so the sibling lookup has something to anchor on. Each
  // synthesized printing gets a unique identity so siblings don't accidentally
  // collide across cross-refs.
  const declared = config.printings;
  const synthesized: MockPrinting[] =
    declared ??
    existingSources.map((src) => ({
      id: src.printingId,
      cardId: `card-${src.printingId}`,
      setId: `set-${src.printingId}`,
      shortCode: `SC-${src.printingId}`,
      publicCode: `PUB-${src.printingId}`,
      finish: src.finish,
      artVariant: "normal",
      isSigned: false,
      language: src.language,
      markerSlugs: [],
    }));

  const printings = synthesized.map((p) => ({
    id: p.id,
    cardId: p.cardId,
    setId: p.setId,
    shortCode: p.shortCode,
    publicCode: p.publicCode ?? `PUB-${p.id}`,
    finish: p.finish,
    artVariant: p.artVariant ?? "normal",
    isSigned: p.isSigned ?? false,
    language: p.language ?? "EN",
    markerSlugs: p.markerSlugs ?? [],
  }));

  const repos = {
    priceRefresh: {
      loadIgnoredKeys: vi.fn(async () => ignoredKeys),
      upsertGroups: vi.fn(async () => {}),
      existingSourcesByMarketplaces: vi.fn(async () => existingSources),
      existingExternalIdsByMarketplace: vi.fn(async () => config.existingCtExternalIds ?? []),
      allPrintingsForPriceMatch: vi.fn(async () => printings),
      batchInsertProductVariants: vi.fn(async () => {}),
    },
    marketplace: { refreshLatestPrices: vi.fn() },
  } as unknown as Repos;

  return { repos };
}

interface MockFetchConfig {
  expansions?: unknown[];
  blueprintsByExpansion?: Map<number, unknown[]>;
  productsByExpansion?: Map<number, Record<string, unknown[]>>;
}

function setupMockFetch(fetchSpy: ReturnType<typeof vi.spyOn>, config: MockFetchConfig = {}) {
  const expansions = config.expansions ?? [];
  const blueprintsByExpansion = config.blueprintsByExpansion ?? new Map();
  const productsByExpansion = config.productsByExpansion ?? new Map();

  fetchSpy.mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes("/expansions")) {
      return Response.json(expansions);
    }
    const bpMatch = urlStr.match(/blueprints\/export\?expansion_id=(\d+)/);
    if (bpMatch) {
      const expId = Number(bpMatch[1]);
      return Response.json(blueprintsByExpansion.get(expId) ?? []);
    }
    const mpMatch = urlStr.match(/marketplace\/products\?expansion_id=(\d+)/);
    if (mpMatch) {
      const expId = Number(mpMatch[1]);
      return Response.json(productsByExpansion.get(expId) ?? {});
    }
    return Response.json([]);
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("refreshCardtraderPrices", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let upsertSpy: ReturnType<typeof vi.spyOn>;
  let logUpsertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));
    upsertSpy = vi.spyOn(upsertMod, "upsertPriceData" as any).mockResolvedValue(ZERO_COUNTS);
    logUpsertSpy = vi.spyOn(logMod, "logUpsertCounts" as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    upsertSpy.mockRestore();
    logUpsertSpy.mockRestore();
  });

  // ── API fetch ────────────────────────────────────────────────────────

  describe("API fetch", () => {
    it("filters expansions to Riftbound game_id only", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A, EXPANSION_OTHER_GAME],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      // Should NOT fetch blueprints for the other game expansion
      const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes("expansion_id=9999"))).toBe(false);
    });

    it("handles empty expansions gracefully", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, { expansions: [] });

      const result = await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(result.transformed.groups).toBe(0);
      expect(result.transformed.products).toBe(0);
      expect(result.transformed.prices).toBe(0);
    });
  });

  // ── Staging rows ─────────────────────────────────────────────────────

  describe("staging rows", () => {
    it("creates normal and foil staging rows from marketplace listings", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en", riftbound_foil: false },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Foil",
                  price_cents: 300,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en", riftbound_foil: true },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(2);
      const normalRow = staging.find((row) => row.finish === "normal");
      const foilRow = staging.find((row) => row.finish === "foil");
      // CardTrader has no separate "market" price; we only store lowCents.
      expect(normalRow?.marketCents).toBeNull();
      expect(normalRow?.lowCents).toBe(100);
      expect(normalRow?.language).toBe("EN");
      expect(foilRow?.marketCents).toBeNull();
      expect(foilRow?.lowCents).toBe(300);
      expect(foilRow?.language).toBe("EN");
    });

    it("groups listings by language", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker EN",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en" },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker JA",
                  price_cents: 50,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "ja" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(2);
      const enRow = staging.find((row) => row.language === "EN");
      const jaRow = staging.find((row) => row.language === "JA");
      expect(enRow).toBeDefined();
      expect(enRow?.lowCents).toBe(100);
      expect(enRow?.language).toBe("EN");
      expect(jaRow).toBeDefined();
      expect(jaRow?.lowCents).toBe(50);
      expect(jaRow?.language).toBe("JA");
    });

    it("skips sealed products (non-singles category)", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_SEALED]]]),
        productsByExpansion: new Map([[1001, {}]]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(0);
    });

    it("skips ignored products", async () => {
      const { repos } = createMockRepos({
        ignoredProducts: [{ externalId: 5001, finish: "normal", language: "EN" }],
      });
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en", riftbound_foil: false },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Foil",
                  price_cents: 300,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en", riftbound_foil: true },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      // Normal is ignored, foil is kept
      expect(staging).toHaveLength(1);
      expect(staging[0].finish).toBe("foil");
    });

    it("picks the cheapest listing per blueprint+finish", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 200,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en" },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Cheap",
                  price_cents: 50,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(1);
      expect(staging[0].lowCents).toBe(50);
    });
  });

  // ── Auto-matching ────────────────────────────────────────────────────

  describe("auto-matching", () => {
    it("auto-matches blueprints via TCGplayer cross-reference", async () => {
      const { repos } = createMockRepos({
        existingSources: [
          {
            marketplace: "tcgplayer",
            externalId: 7001,
            printingId: "p-1",
            groupId: 101,
            productName: "Flame Striker",
          },
        ],
      });
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_foil: false, riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(repos.priceRefresh.batchInsertProductVariants).toHaveBeenCalled();
    });

    it("auto-matches blueprints via Cardmarket cross-reference", async () => {
      const { repos } = createMockRepos({
        existingSources: [
          {
            marketplace: "cardmarket",
            externalId: 8001,
            printingId: "p-1",
            groupId: 201,
            productName: "Flame Striker",
          },
        ],
      });
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_foil: false, riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(repos.priceRefresh.batchInsertProductVariants).toHaveBeenCalled();
    });

    it("skips already-existing cardtrader products", async () => {
      const { repos } = createMockRepos({
        existingSources: [
          {
            marketplace: "tcgplayer",
            externalId: 7001,
            printingId: "p-1",
            groupId: 101,
            productName: "Flame Striker",
          },
        ],
        existingCtExternalIds: [5001],
      });
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([[1001, {}]]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(repos.priceRefresh.batchInsertProductVariants).not.toHaveBeenCalled();
    });

    it("does not auto-match blueprints without cross-references", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_ICE]]]),
        productsByExpansion: new Map([[1001, {}]]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(repos.priceRefresh.batchInsertProductVariants).not.toHaveBeenCalled();
    });

    it("resolves ZH-CN listings to the ZH sibling printing", async () => {
      // The EN printing and its ZH sibling share the same identity tuple
      // (card, set, short_code, finish, art_variant, is_signed, marker_slugs)
      // but differ on language. The TCG cross-reference lands on the EN
      // printing; the matcher walks across the sibling lookup to the ZH one.
      const enPrinting: MockPrinting = {
        id: "p-en",
        cardId: "card-flame",
        setId: "set-origins",
        shortCode: "OGS-001",
        finish: "normal",
        language: "EN",
      };
      const zhPrinting: MockPrinting = {
        id: "p-zh",
        cardId: "card-flame",
        setId: "set-origins",
        shortCode: "OGS-001",
        finish: "normal",
        language: "ZH",
      };
      const { repos } = createMockRepos({
        existingSources: [
          {
            marketplace: "tcgplayer",
            externalId: 7001,
            printingId: "p-en",
            groupId: 101,
            productName: "Flame Striker",
          },
        ],
        printings: [enPrinting, zhPrinting],
      });
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 200,
                  price_currency: "EUR",
                  // CardTrader emits `zh-CN`; the matcher should normalize to `ZH`.
                  properties_hash: { riftbound_foil: false, riftbound_language: "zh-CN" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(repos.priceRefresh.batchInsertProductVariants).toHaveBeenCalled();
      const insertCall = (
        repos.priceRefresh.batchInsertProductVariants as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0][0] as { printingId: string; finish: string; language: string }[];
      expect(insertCall).toHaveLength(1);
      expect(insertCall[0]).toMatchObject({
        printingId: "p-zh",
        finish: "normal",
        language: "ZH",
      });
    });

    it("emits both EN and ZH variants when a blueprint sells in both languages", async () => {
      const enPrinting: MockPrinting = {
        id: "p-en",
        cardId: "card-flame",
        setId: "set-origins",
        shortCode: "OGS-001",
        finish: "normal",
        language: "EN",
      };
      const zhPrinting: MockPrinting = {
        id: "p-zh",
        cardId: "card-flame",
        setId: "set-origins",
        shortCode: "OGS-001",
        finish: "normal",
        language: "ZH",
      };
      const { repos } = createMockRepos({
        existingSources: [
          {
            marketplace: "tcgplayer",
            externalId: 7001,
            printingId: "p-en",
            groupId: 101,
            productName: "Flame Striker",
          },
        ],
        printings: [enPrinting, zhPrinting],
      });
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_foil: false, riftbound_language: "en" },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 150,
                  price_currency: "EUR",
                  properties_hash: { riftbound_foil: false, riftbound_language: "zh-CN" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const insertCall = (
        repos.priceRefresh.batchInsertProductVariants as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0][0] as { printingId: string; finish: string; language: string }[];
      expect(insertCall).toHaveLength(2);
      expect(insertCall).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ printingId: "p-en", finish: "normal", language: "EN" }),
          expect.objectContaining({ printingId: "p-zh", finish: "normal", language: "ZH" }),
        ]),
      );
    });

    it("skips ZH listings when no ZH sibling printing exists", async () => {
      // Only an EN printing exists in the catalog — the ZH listing from
      // cardtrader should be silently dropped from auto-match.
      const enPrinting: MockPrinting = {
        id: "p-en",
        cardId: "card-flame",
        setId: "set-origins",
        shortCode: "OGS-001",
        finish: "normal",
        language: "EN",
      };
      const { repos } = createMockRepos({
        existingSources: [
          {
            marketplace: "tcgplayer",
            externalId: 7001,
            printingId: "p-en",
            groupId: 101,
            productName: "Flame Striker",
          },
        ],
        printings: [enPrinting],
      });
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 200,
                  price_currency: "EUR",
                  properties_hash: { riftbound_foil: false, riftbound_language: "zh-CN" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(repos.priceRefresh.batchInsertProductVariants).not.toHaveBeenCalled();
    });
  });

  describe("ctFetch edge cases", () => {
    it("throws on HTTP error response", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();

      // Make the expansions endpoint return an error
      fetchSpy.mockResolvedValueOnce(
        new Response("Server Error", { status: 500, statusText: "Internal Server Error" }),
      );

      await expect(
        refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token"),
      ).rejects.toThrow("HTTP 500");
    });

    it("unwraps {array: [...]} response format", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();

      // Return expansions wrapped in {array: [...]}
      fetchSpy.mockImplementation(async (url: string | URL | Request) => {
        const urlStr =
          typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("/expansions")) {
          return Response.json({ array: [EXPANSION_A] });
        }
        if (urlStr.includes("blueprints/export")) {
          return Response.json([]);
        }
        if (urlStr.includes("marketplace/products")) {
          return Response.json({});
        }
        return Response.json([]);
      });

      const result = await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");
      expect(result.transformed.groups).toBe(1);
    });
  });

  describe("marketplace listing edge cases", () => {
    it("skips blueprints with empty listing arrays", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([[1001, { "5001": [] }]]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(0);
    });

    it("filters out non-Near Mint condition listings", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker NM",
                  price_cents: 200,
                  price_currency: "EUR",
                  condition: "Near Mint",
                  properties_hash: { riftbound_language: "en" },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker LP",
                  price_cents: 50,
                  price_currency: "EUR",
                  condition: "Lightly Played",
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(1);
      expect(staging[0].lowCents).toBe(200);
    });

    it("includes listings without a condition field (assumed NM)", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(1);
      expect(staging[0].lowCents).toBe(100);
    });

    it("skips blueprint entirely when all listings are non-NM", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker LP",
                  price_cents: 50,
                  price_currency: "EUR",
                  condition: "Lightly Played",
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(0);
    });

    it("excludes on_vacation listings from pricing", async () => {
      // The cheaper listing is on vacation and must be dropped; the NM non-vacation
      // listing should become the low price instead.
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Vacation",
                  price_cents: 50,
                  price_currency: "EUR",
                  on_vacation: true,
                  properties_hash: { riftbound_language: "en" },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Available",
                  price_cents: 200,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(1);
      expect(staging[0].lowCents).toBe(200);
    });

    it("excludes bundle_size > 1 listings from pricing", async () => {
      // Bundle listings quote the total for the whole pack, not per-card,
      // so including them would misrepresent the price.
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker 4x Bundle",
                  price_cents: 40,
                  price_currency: "EUR",
                  bundle_size: 4,
                  properties_hash: { riftbound_language: "en" },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Single",
                  price_cents: 100,
                  price_currency: "EUR",
                  bundle_size: 1,
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(1);
      expect(staging[0].lowCents).toBe(100);
    });

    it("populates zeroLowCents with the cheapest Zero-eligible listing", async () => {
      // Cheapest overall is a non-Zero seller at 80; cheapest Zero is 150.
      // Expect lowCents=80 and zeroLowCents=150.
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Non-Zero",
                  price_cents: 80,
                  price_currency: "EUR",
                  user: { can_sell_via_hub: false },
                  properties_hash: { riftbound_language: "en" },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Zero Expensive",
                  price_cents: 200,
                  price_currency: "EUR",
                  user: { can_sell_via_hub: true },
                  properties_hash: { riftbound_language: "en" },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Zero Cheap",
                  price_cents: 150,
                  price_currency: "EUR",
                  user: { can_sell_via_hub: true },
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(1);
      expect(staging[0].lowCents).toBe(80);
      expect(staging[0].zeroLowCents).toBe(150);
    });

    it("leaves zeroLowCents null when no listings are Zero-eligible", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  user: { can_sell_via_hub: false },
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      expect(staging).toHaveLength(1);
      expect(staging[0].lowCents).toBe(100);
      expect(staging[0].zeroLowCents).toBeNull();
    });

    it("picks the cheapest foil listing when multiple exist", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Foil Expensive",
                  price_cents: 500,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en", riftbound_foil: true },
                },
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker Foil Cheap",
                  price_cents: 150,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en", riftbound_foil: true },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const staging: StagingRow[] = upsertSpy.mock.calls[0][3];
      const foilRow = staging.find((row) => row.finish === "foil");
      expect(foilRow).toBeDefined();
      expect(foilRow?.lowCents).toBe(150);
    });
  });

  // ── Return value ─────────────────────────────────────────────────────

  describe("return value", () => {
    it("returns transformed and upserted counts", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A, EXPANSION_B],
        blueprintsByExpansion: new Map([
          [1001, [BLUEPRINT_FLAME]],
          [1002, []],
        ]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      const result = await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(result.transformed.groups).toBe(2);
      expect(result.transformed.products).toBe(1);
      expect(result.transformed.prices).toBe(1);
      expect(result.upserted).toBe(ZERO_COUNTS);
    });
  });

  // ── Logging ──────────────────────────────────────────────────────────

  describe("logging", () => {
    it("logs expansion and price counts", async () => {
      const { repos } = createMockRepos();
      const { log, messages } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, [BLUEPRINT_FLAME]]]),
        productsByExpansion: new Map([
          [
            1001,
            {
              "5001": [
                {
                  blueprint_id: 5001,
                  name_en: "Flame Striker",
                  price_cents: 100,
                  price_currency: "EUR",
                  properties_hash: { riftbound_language: "en" },
                },
              ],
            },
          ],
        ]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(messages.some((msg) => msg.includes("1 Riftbound expansions"))).toBe(true);
      expect(messages.some((msg) => msg.includes("1 blueprints total"))).toBe(true);
    });

    it("calls logUpsertCounts", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, { expansions: [] });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      expect(logUpsertSpy).toHaveBeenCalledWith(log, ZERO_COUNTS);
    });
  });

  // ── Group upsert ─────────────────────────────────────────────────────

  describe("group upsert", () => {
    it("upserts expansion groups with code and name", async () => {
      const { repos } = createMockRepos();
      const { log } = makeMockLogger();
      setupMockFetch(fetchSpy, {
        expansions: [EXPANSION_A],
        blueprintsByExpansion: new Map([[1001, []]]),
        productsByExpansion: new Map([[1001, {}]]),
      });

      await refreshCardtraderPrices(globalThis.fetch, repos, log, "test-token");

      const upsertGroupsSpy = vi.spyOn(upsertMod, "upsertMarketplaceGroups" as any);
      // Verify that upsertMarketplaceGroups was called (it's in the module)
      expect(repos.priceRefresh.upsertGroups).toHaveBeenCalled();
      upsertGroupsSpy.mockRestore();
    });
  });
});
