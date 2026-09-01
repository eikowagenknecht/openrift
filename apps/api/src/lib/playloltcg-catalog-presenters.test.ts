import { describe, expect, it } from "vitest";

import type { PlayloltcgListRow } from "../repositories/playloltcg-events.js";
import { toPlayloltcgCatalogRow } from "./playloltcg-catalog-presenters.js";

function listRow(overrides: Partial<PlayloltcgListRow> = {}): PlayloltcgListRow {
  return {
    activityShopId: 109_991,
    shopId: 3648,
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
    firstSeenAt: new Date("2026-08-20T12:00:00Z"),
    lastSeenAt: new Date("2026-08-20T12:00:00Z"),
    missingSince: null,
    triage: "accepted",
    metaEventId: "live-1",
    metaEventSlug: "shenzhen-legend-challenge",
    shopDisplayName: "卡之域卡牌 深圳",
    nextCheckAt: new Date("2026-08-31T12:00:00Z"),
    checkStage: 1,
    fetchedAt: new Date("2026-08-30T18:00:00Z"),
    stagedPlayerCount: 41,
    stagedLegendCount: 38,
    stagedDeckCount: 12,
    ...overrides,
  };
}

describe("toPlayloltcgCatalogRow", () => {
  it("passes the stored day through, since start_at is a date column", () => {
    expect(toPlayloltcgCatalogRow(listRow()).startAt).toBe("2026-08-30");
    expect(toPlayloltcgCatalogRow(listRow({ startAt: null })).startAt).toBeNull();
  });

  it("prefers the linked store's current name and builds the citation URL", () => {
    const row = toPlayloltcgCatalogRow(listRow());

    expect(row).toMatchObject({
      activityShopId: 109_991,
      shopName: "卡之域卡牌 深圳",
      city: "深圳市",
      status: 5,
      triage: "accepted",
      metaEventSlug: "shenzhen-legend-challenge",
      fetchedAt: "2026-08-30T18:00:00.000Z",
      sourceUrl: "https://playloltcg.com/activity/109991",
    });
  });

  it("reports a row the deep fetch has never landed on", () => {
    const row = toPlayloltcgCatalogRow(
      listRow({ fetchedAt: null, metaEventId: null, metaEventSlug: null, triage: "new" }),
    );

    expect(row.fetchedAt).toBeNull();
    expect(row.triage).toBe("new");
  });

  it("carries the coverage the catalogue's chips read", () => {
    const row = toPlayloltcgCatalogRow(listRow());

    expect(row).toMatchObject({
      stagedPlayerCount: 41,
      stagedLegendCount: 38,
      stagedDeckCount: 12,
      nextCheckAt: "2026-08-31T12:00:00.000Z",
      missingSince: null,
    });
  });

  it("reports when the listing stopped returning the row", () => {
    const row = toPlayloltcgCatalogRow(listRow({ missingSince: new Date("2026-08-25T00:00:00Z") }));

    expect(row.missingSince).toBe("2026-08-25T00:00:00.000Z");
  });
});
