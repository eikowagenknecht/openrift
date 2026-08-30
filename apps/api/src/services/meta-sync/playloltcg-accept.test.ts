import { createLogger } from "@openrift/shared/logger";
import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { acceptCandidateEvent } from "../meta-candidate-accept.js";
import { autoAcceptPlayloltcgEvents } from "./playloltcg-accept.js";
import type { PlayloltcgClient } from "./playloltcg-client.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";

vi.mock("../meta-candidate-accept.js", () => ({
  acceptCandidateEvent: vi.fn(() =>
    Promise.resolve({ metaEventId: "live-1", slug: "shenzhen-1", created: true }),
  ),
  acceptCandidatePlayer: vi.fn(() => Promise.resolve()),
}));

const NOW = new Date("2026-08-30T12:00:00Z");

function catalogRow(overrides: Partial<PlayloltcgListRow> = {}): PlayloltcgListRow {
  return {
    activityShopId: 109_991,
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
    triage: "new",
    candidateEventId: null,
    metaEventId: null,
    metaEventSlug: null,
    shopDisplayName: "卡之域卡牌 深圳",
    nextCheckAt: null,
    checkStage: 0,
    fetchedAt: null,
    ...overrides,
  };
}

interface RecheckWrite {
  activityShopId: number;
  nextCheckAt: Date | null;
  checkStage: number;
}

function fakeDeps(options: {
  unaccepted: PlayloltcgListRow[];
  autoAcceptMinPlayers: number | null;
}): {
  deps: PlayloltcgSyncDeps;
  inserted: Record<string, unknown>[];
  rechecks: RecheckWrite[];
} {
  const inserted: Record<string, unknown>[] = [];
  const rechecks: RecheckWrite[] = [];

  const playloltcgEvents = {
    unacceptedByKeys: () => Promise.resolve(options.unaccepted),
    setRecheck: (activityShopId: number, values: Omit<RecheckWrite, "activityShopId">) => {
      rechecks.push({ activityShopId, ...values });
      return Promise.resolve();
    },
  };

  const metaCandidates = {
    eventsBySourceKeys: () => Promise.resolve([]),
    insertEvent: (values: Record<string, unknown>) => {
      inserted.push(values);
      return Promise.resolve(`cand-${inserted.length}`);
    },
  };

  const deps: PlayloltcgSyncDeps = {
    repos: {
      playloltcgEvents,
      metaCandidates,
      uvsgamesEvents: {
        settings: () => Promise.resolve({ autoAcceptMinPlayers: options.autoAcceptMinPlayers }),
      },
    } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no writes here"))) as unknown as Transact,
    client: { requests: 0 } as unknown as PlayloltcgClient,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, inserted, rechecks };
}

describe("autoAcceptPlayloltcgEvents", () => {
  it("stages tier, country and location, matching what a deep fetch would write", async () => {
    const { deps, inserted } = fakeDeps({ unaccepted: [catalogRow()], autoAcceptMinPlayers: 16 });

    await autoAcceptPlayloltcgEvents(deps, [109_991]);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      externalId: "109991",
      eventDate: "2026-08-30",
      tier: null,
      country: "CN",
      location: "深圳市",
      organizer: "卡之域卡牌 深圳",
    });
  });

  it("falls back to the address when the venue has no city", async () => {
    const { deps, inserted } = fakeDeps({
      unaccepted: [catalogRow({ city: null })],
      autoAcceptMinPlayers: 16,
    });

    await autoAcceptPlayloltcgEvents(deps, [109_991]);

    expect(inserted[0]).toMatchObject({ location: "华强北世纪汇商场6层" });
  });

  it("dates an event with no start on the day it is accepted", async () => {
    const { deps, inserted } = fakeDeps({
      unaccepted: [catalogRow({ startAt: null })],
      autoAcceptMinPlayers: 16,
    });

    await autoAcceptPlayloltcgEvents(deps, [109_991]);

    expect(inserted[0]).toMatchObject({ eventDate: "2026-08-30" });
  });

  it("arms the recheck queue at now so the next pass picks the event up", async () => {
    const { deps, rechecks } = fakeDeps({ unaccepted: [catalogRow()], autoAcceptMinPlayers: 16 });

    const summary = await autoAcceptPlayloltcgEvents(deps, [109_991]);

    expect(summary.accepted).toBe(1);
    expect(rechecks).toEqual([{ activityShopId: 109_991, nextCheckAt: NOW, checkStage: 0 }]);
    expect(acceptCandidateEvent).toHaveBeenCalled();
  });

  it("leaves an event below the threshold, and every event when the rule is off", async () => {
    const small = fakeDeps({
      unaccepted: [catalogRow({ playerCount: 4 })],
      autoAcceptMinPlayers: 16,
    });
    const belowThreshold = await autoAcceptPlayloltcgEvents(small.deps, [109_991]);
    expect(belowThreshold.accepted).toBe(0);
    expect(small.inserted).toEqual([]);

    const off = fakeDeps({ unaccepted: [catalogRow()], autoAcceptMinPlayers: null });
    const ruleOff = await autoAcceptPlayloltcgEvents(off.deps, [109_991]);
    expect(ruleOff.accepted).toBe(0);
    expect(off.inserted).toEqual([]);
  });
});
