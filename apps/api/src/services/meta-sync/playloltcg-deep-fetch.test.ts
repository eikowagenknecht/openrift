import { createLogger } from "@openrift/shared/logger";
import { describe, expect, it } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import type { PlayloltcgClient, PlayloltcgList } from "./playloltcg-client.js";
import { PlayloltcgBlockedError } from "./playloltcg-client.js";
import type { PlayloltcgDetailFacts } from "./playloltcg-deep-fetch.js";
import { playloltcgDeepFetch } from "./playloltcg-deep-fetch.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";

const NOW = new Date("2026-08-30T12:00:00Z");
const ACTIVITY_SHOP_ID = 109_991;
const DETAIL: PlayloltcgDetailFacts = {
  shopId: 3648,
  shopName: "卡之域卡牌 深圳",
  isPublishResult: true,
};

const STANDINGS_PATH = "/xcx/activityUser/pageForActivityDetail";
const DECK_PATH = "/xcx/cardGroup/getActivityCardGroupCardListImage";

function catalogRow(overrides: Partial<PlayloltcgListRow> = {}): PlayloltcgListRow {
  return {
    activityShopId: ACTIVITY_SHOP_ID,
    shopId: null,
    shopName: "卡之域卡牌",
    name: "本命传奇挑战",
    activityType: "rune_competition",
    activityTypeName: "符文竞技",
    battleMode: "1v1",
    status: 5,
    startAt: "2026-08-30",
    endAt: "2026-08-30",
    playerCount: 41,
    maxUser: 66,
    fee: 0,
    province: "广东省",
    city: "深圳市",
    area: "福田区",
    address: "华强北世纪汇商场6层",
    longitude: 114.083809,
    latitude: 22.541325,
    contentHash: "hash",
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    triage: "accepted",
    metaEventId: null,
    metaEventSlug: null,
    shopDisplayName: "卡之域卡牌 深圳",
    nextCheckAt: NOW,
    checkStage: 0,
    fetchedAt: null,
    ...overrides,
  };
}

interface Harness {
  deps: PlayloltcgSyncDeps;
  /** Every deck id the client was actually asked for. */
  deckRequests: number[];
  /** The standings rows written into this source's mirror. */
  mirrored: Record<string, unknown>[];
  /** The decklists recorded, each with the lines projected from its body. */
  storedDecklists: { row: Record<string, unknown>; cards: Record<string, unknown>[] }[];
}

function fakeDeps(options: {
  standings: Record<string, unknown>[][] | Error;
  decks?: Record<number, Record<string, unknown>[]>;
  /** Deck ids the mirror already holds, which the fetch never asks for again. */
  heldDecks?: string[];
  /** Lines the mirror holds for a deck an earlier pass fetched, by deck id. */
  heldLines?: Map<string, { zone: string; quantity: number; cardName: string }[]>;
}): Harness {
  const deckRequests: number[] = [];
  const mirrored: Record<string, unknown>[] = [];
  const storedDecklists: { row: Record<string, unknown>; cards: Record<string, unknown>[] }[] = [];
  let standingsPage = 0;

  const client = {
    requests: 0,
    postList: <T>(path: string, body: Record<string, unknown>): Promise<PlayloltcgList<T>> => {
      if (path === STANDINGS_PATH) {
        if (options.standings instanceof Error) {
          return Promise.reject(options.standings);
        }
        const pages = options.standings;
        const items = pages[standingsPage] ?? [];
        standingsPage++;
        const total = pages.reduce((sum, page) => sum + page.length, 0);
        return Promise.resolve({ items: items as T[], total });
      }
      if (path === DECK_PATH) {
        const id = Number(body.id);
        deckRequests.push(id);
        return Promise.resolve({ items: (options.decks?.[id] ?? []) as T[], total: 0 });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    },
    get: () => Promise.reject(new Error("the deep fetch is handed its detail")),
  } as unknown as PlayloltcgClient;

  const playloltcgEvents = {
    linkShopFromDetail: () => Promise.resolve(),
    cardsByShortCode: () => Promise.resolve(new Map()),
  };

  const playloltcgResults = {
    heldDeckIds: () => Promise.resolve(new Set(options.heldDecks)),
    decklistCards: () => Promise.resolve(options.heldLines ?? new Map()),
    replaceStandings: (_id: number, rows: Record<string, unknown>[]) => {
      mirrored.push(...rows);
      return Promise.resolve();
    },
    putDecklist: (row: Record<string, unknown>, cards: Record<string, unknown>[]) => {
      storedDecklists.push({ row, cards });
      return Promise.resolve();
    },
  };

  // Promotion is its own unit; the fetch's job is to mirror and then call it.
  const meta = { sourceByKey: () => Promise.resolve(undefined) };

  const deps: PlayloltcgSyncDeps = {
    repos: { playloltcgEvents, playloltcgResults, meta } as unknown as Repos,
    transact: (() => Promise.reject(new Error("the ingest is faked"))) as unknown as Transact,
    client,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, deckRequests, mirrored, storedDecklists };
}

function standingsRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "张三", finalRanking: 1, winCount: 4, cardGroupId: 0, ...overrides };
}

describe("playloltcgDeepFetch", () => {
  it("mirrors every standings row with its rank and record", async () => {
    const { deps, mirrored } = fakeDeps({
      standings: [
        [
          standingsRow({ name: "张三", finalRanking: 1, winCount: 5 }),
          standingsRow({ name: "李四", finalRanking: 2, winCount: 3 }),
        ],
      ],
    });

    const result = await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    // The event's own fields are promotion's, read from the listing mirror.
    // What the fetch writes is the field.
    expect(result).toMatchObject({ players: 2, decks: 0, complete: true });
    expect(mirrored.map((player) => player.rank)).toEqual([1, 2]);
    expect(mirrored.map((player) => player.playerName)).toEqual(["张三", "李四"]);
    expect(mirrored[0]?.sourceDeckId).toBeNull();
  });

  it("keys a player on something the source's re-ranking cannot move", async () => {
    const provisional = fakeDeps({
      standings: [
        [
          standingsRow({ name: "张三", finalRanking: 1 }),
          standingsRow({ name: "李四", finalRanking: 2 }),
        ],
      ],
    });
    await playloltcgDeepFetch(provisional.deps, catalogRow(), DETAIL);
    const before = provisional.mirrored.map(
      (player) => `${String(player.playerName)}=${String(player.playerKey)}`,
    );

    const final = fakeDeps({
      standings: [
        [
          standingsRow({ name: "李四", finalRanking: 1 }),
          standingsRow({ name: "张三", finalRanking: 2 }),
        ],
      ],
    });
    await playloltcgDeepFetch(final.deps, catalogRow(), DETAIL);
    const after = final.mirrored.map(
      (player) => `${String(player.playerName)}=${String(player.playerKey)}`,
    );

    expect(after.toSorted()).toEqual(before.toSorted());
  });

  it("prefers the source's own user id as the key when the payload carries one", async () => {
    const { deps, mirrored } = fakeDeps({
      standings: [[standingsRow({ userId: 88_120, finalRanking: 3 })]],
    });

    await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    expect(mirrored[0]?.playerKey).toBe("u88120");
  });

  it("gives two players sharing a name one key each", async () => {
    const { deps, mirrored } = fakeDeps({
      standings: [
        [
          standingsRow({ name: "张三", finalRanking: 1 }),
          standingsRow({ name: "张三", finalRanking: 2 }),
        ],
      ],
    });

    await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    const keys = mirrored.map((row) => row.playerKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("writes nothing when a standings page fails, rather than a truncated field", async () => {
    const { deps, mirrored } = fakeDeps({ standings: new Error("HTTP 502 for standings") });

    const result = await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    expect(result.complete).toBe(false);
    expect(result.players).toBe(0);
    expect(result.errors[0]).toContain("standings page 1");
    expect(mirrored).toEqual([]);
  });

  it("asks only for the decks the mirror still owes", async () => {
    const { deps, deckRequests, storedDecklists } = fakeDeps({
      standings: [
        [
          standingsRow({ name: "张三", finalRanking: 1, cardGroupId: 11 }),
          standingsRow({ name: "李四", finalRanking: 2, cardGroupId: 12 }),
        ],
      ],
      decks: { 12: [{ cardNo: "SFD·195/221", cardName: "破晓", cardCount: 3 }] },
      heldDecks: ["11"],
    });

    const result = await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    // Deck 11 is already held, so it costs no request and is not rewritten.
    expect(deckRequests).toEqual([12]);
    expect(result.decks).toBe(1);
    expect(storedDecklists.map((entry) => entry.row.sourceDeckId)).toEqual(["12"]);
  });

  it("keeps the legend of a deck an earlier pass already mirrored", async () => {
    const { deps, mirrored, deckRequests } = fakeDeps({
      standings: [[standingsRow({ name: "张三", finalRanking: 1, cardGroupId: 11 })]],
      heldDecks: ["11"],
      heldLines: new Map([["11", [{ zone: "legend", quantity: 1, cardName: "亚索" }]]]),
    });

    await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    // The body is never re-requested, so the legend has to come off the stored
    // lines rather than the empty body this pass has for that deck.
    expect(deckRequests).toEqual([]);
    expect(mirrored[0]?.legendName).toBe("亚索");
  });

  it("lets a WAF block out so the job can stand the source down", async () => {
    const { deps } = fakeDeps({ standings: new PlayloltcgBlockedError("/xcx/activityUser") });

    await expect(playloltcgDeepFetch(deps, catalogRow(), DETAIL)).rejects.toBeInstanceOf(
      PlayloltcgBlockedError,
    );
  });

  it("reports the decks a wide field left for the next recheck", async () => {
    const rows = Array.from({ length: 405 }, (_, index) =>
      standingsRow({ name: `选手${index}`, finalRanking: index + 1, cardGroupId: index + 1 }),
    );
    const { deps, deckRequests } = fakeDeps({ standings: [rows] });

    const result = await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    expect(deckRequests).toHaveLength(400);
    expect(result.errors.some((line) => line.includes("missing 405 decks"))).toBe(true);
  });
});
