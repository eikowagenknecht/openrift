import type { MetaIngestEvent } from "@openrift/shared";
import { createLogger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CandidateMetaEventRaw } from "../../db/index.js";
import type { Repos, Transact } from "../../deps.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { ingestMetaCandidates } from "../ingest-meta-candidates.js";
import type { PlayloltcgClient, PlayloltcgList } from "./playloltcg-client.js";
import { PlayloltcgBlockedError } from "./playloltcg-client.js";
import type { PlayloltcgDetailFacts } from "./playloltcg-deep-fetch.js";
import { playloltcgDeepFetch } from "./playloltcg-deep-fetch.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";

const staged: MetaIngestEvent[] = [];

vi.mock("../ingest-meta-candidates.js", () => ({
  ingestMetaCandidates: vi.fn(
    (_transact: unknown, _provider: string, events: MetaIngestEvent[]) => {
      staged.push(...events);
      return Promise.resolve({ errors: [] });
    },
  ),
}));

vi.mock("./playloltcg-accept.js", () => ({
  autoAcceptPlayloltcgPlayers: vi.fn(() =>
    Promise.resolve({ accepted: 0, skipped: 0, errors: [] }),
  ),
}));

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
    candidateEventId: "cand-1",
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
  /** The raw payloads written back onto the candidate. */
  rawWrites: CandidateMetaEventRaw[];
}

function fakeDeps(options: {
  standings: Record<string, unknown>[][] | Error;
  decks?: Record<number, Record<string, unknown>[]>;
  storedRaw?: CandidateMetaEventRaw | null;
}): Harness {
  const deckRequests: number[] = [];
  const rawWrites: CandidateMetaEventRaw[] = [];
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

  const metaCandidates = {
    eventsBySourceKeys: () =>
      Promise.resolve([
        { id: "cand-1", metaEventId: null, fetchedAt: null, raw: options.storedRaw ?? null },
      ]),
    updateEvent: (_id: string, updates: { raw?: CandidateMetaEventRaw }) => {
      if (updates.raw !== undefined) {
        rawWrites.push(updates.raw);
      }
      return Promise.resolve();
    },
    setEventCheckedAt: () => Promise.resolve(),
  };

  const deps: PlayloltcgSyncDeps = {
    repos: { playloltcgEvents, metaCandidates } as unknown as Repos,
    transact: (() => Promise.reject(new Error("the ingest is faked"))) as unknown as Transact,
    client,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, deckRequests, rawWrites };
}

function standingsRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "张三", finalRanking: 1, winCount: 4, cardGroupId: 0, ...overrides };
}

beforeEach(() => {
  staged.length = 0;
  vi.mocked(ingestMetaCandidates).mockClear();
});

describe("playloltcgDeepFetch", () => {
  it("stages every standings row with its rank, record and event metadata", async () => {
    const { deps } = fakeDeps({
      standings: [
        [
          standingsRow({ name: "张三", finalRanking: 1, winCount: 5 }),
          standingsRow({ name: "李四", finalRanking: 2, winCount: 3 }),
        ],
      ],
    });

    const result = await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    expect(result).toMatchObject({ players: 2, decks: 0, complete: true });
    expect(staged[0]).toMatchObject({
      externalId: "109991",
      eventDate: "2026-08-30",
      country: "CN",
      location: "深圳市",
      organizer: "卡之域卡牌 深圳",
    });
    expect(staged[0]?.players?.map((player) => player.rank)).toEqual([1, 2]);
    expect(staged[0]?.players?.[0]?.listStatus).toBe("none");
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
    const before = staged[0]?.players?.map((player) => `${player.playerName}=${player.externalId}`);

    staged.length = 0;
    const final = fakeDeps({
      standings: [
        [
          standingsRow({ name: "李四", finalRanking: 1 }),
          standingsRow({ name: "张三", finalRanking: 2 }),
        ],
      ],
    });
    await playloltcgDeepFetch(final.deps, catalogRow(), DETAIL);
    const after = staged[0]?.players?.map((player) => `${player.playerName}=${player.externalId}`);

    expect(after?.toSorted()).toEqual(before?.toSorted());
  });

  it("prefers the source's own user id as the key when the payload carries one", async () => {
    const { deps } = fakeDeps({
      standings: [[standingsRow({ userId: 88_120, finalRanking: 3 })]],
    });

    await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    expect(staged[0]?.players?.[0]?.externalId).toBe("u88120");
  });

  it("gives two players sharing a name one key each", async () => {
    const { deps } = fakeDeps({
      standings: [
        [
          standingsRow({ name: "张三", finalRanking: 1 }),
          standingsRow({ name: "张三", finalRanking: 2 }),
        ],
      ],
    });

    await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    const keys = staged[0]?.players?.map((player) => player.externalId) ?? [];
    expect(new Set(keys).size).toBe(2);
  });

  it("stages nothing when a standings page fails, rather than a truncated field", async () => {
    const { deps, rawWrites } = fakeDeps({ standings: new Error("HTTP 502 for standings") });

    const result = await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    expect(result.complete).toBe(false);
    expect(result.players).toBe(0);
    expect(result.errors[0]).toContain("standings page 1");
    expect(ingestMetaCandidates).not.toHaveBeenCalled();
    expect(rawWrites).toEqual([]);
  });

  it("reuses the deck bodies the stored payload already holds", async () => {
    const { deps, deckRequests, rawWrites } = fakeDeps({
      standings: [
        [
          standingsRow({ name: "张三", finalRanking: 1, cardGroupId: 11 }),
          standingsRow({ name: "李四", finalRanking: 2, cardGroupId: 12 }),
        ],
      ],
      decks: { 12: [{ cardNo: "SFD·195/221", cardName: "破晓", cardCount: 3 }] },
      storedRaw: { decks: { "11": [{ cardNo: "VEN·038", cardName: "夜幕", cardCount: 2 }] } },
    });

    const result = await playloltcgDeepFetch(deps, catalogRow(), DETAIL);

    expect(deckRequests).toEqual([12]);
    expect(result.decks).toBe(2);
    expect(Object.keys(rawWrites[0]?.decks as Record<string, unknown>).toSorted()).toEqual([
      "11",
      "12",
    ]);
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
