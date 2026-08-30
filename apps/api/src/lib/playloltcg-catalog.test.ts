import { describe, expect, it } from "vitest";

import {
  normalizeCardNo,
  playloltcgContentHash,
  projectDeckCard,
  projectEventRow,
  projectShopRow,
  referencedDeckIds,
  unfetchedDeckIds,
} from "./playloltcg-catalog.js";

function eventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activityShopId: 109_991,
    shopName: "卡之域卡牌",
    name: "本命传奇挑战",
    activityType: "rune_competition",
    activityTypeName: "符文竞技",
    battleMode: "1v1",
    sortWeight: 5,
    startTime: "2026-08-30",
    endTime: "2026-08-30",
    applyNum: 41,
    maxUser: 66,
    applyAmount: 0,
    activityProvince: "广东省",
    activityCity: "深圳市",
    activityArea: "福田区",
    activityAddress: "华强北世纪汇商场6层",
    longitude: 114.083809,
    latitude: 22.541325,
    ...overrides,
  };
}

describe("projectShopRow", () => {
  it("reads the registry row into the slim shop shape", () => {
    const shop = projectShopRow({
      id: 3648,
      name: "元宇宙卡牌",
      province: "北京市",
      city: "东城区",
      area: "",
      address: "珠市口天鼎218",
      longitude: 116.402184,
      latitude: 39.891495,
    });

    expect(shop).toEqual({
      id: 3648,
      name: "元宇宙卡牌",
      province: "北京市",
      city: "东城区",
      area: null,
      address: "珠市口天鼎218",
      longitude: 116.402184,
      latitude: 39.891495,
    });
  });

  it("drops a row with no id or name", () => {
    expect(projectShopRow({ name: "no id" })).toBeNull();
    expect(projectShopRow({ id: 3648, name: "  " })).toBeNull();
    expect(projectShopRow("nope")).toBeNull();
  });
});

describe("projectEventRow", () => {
  it("reads every projected field including the sortWeight lifecycle", () => {
    const event = projectEventRow(eventRow());

    expect(event).toMatchObject({
      activityShopId: 109_991,
      shopName: "卡之域卡牌",
      name: "本命传奇挑战",
      activityType: "rune_competition",
      battleMode: "1v1",
      status: 5,
      playerCount: 41,
      maxUser: 66,
      fee: 0,
      city: "深圳市",
    });
    expect(event?.startAt).toBe("2026-08-30");
  });

  it("keeps the day as the string the date column stores, dropping any time part", () => {
    const event = projectEventRow(eventRow({ startTime: "2026-08-30 14:00:00", endTime: "" }));
    expect(event?.startAt).toBe("2026-08-30");
    expect(event?.endAt).toBeNull();
  });

  it("reads the sortWeight status as a number whether the source sent int or string", () => {
    expect(projectEventRow(eventRow({ sortWeight: "4" }))?.status).toBe(4);
    expect(projectEventRow(eventRow({ sortWeight: 1 }))?.status).toBe(1);
    expect(projectEventRow(eventRow({ sortWeight: 0 }))?.status).toBeNull();
    expect(projectEventRow(eventRow({ sortWeight: undefined }))?.status).toBeNull();
  });

  it("falls back to the shop-level venue when the event omits its own", () => {
    const event = projectEventRow(
      eventRow({
        activityCity: undefined,
        shopCity: "上海市",
        activityAddress: undefined,
        address: "shop addr",
      }),
    );
    expect(event?.city).toBe("上海市");
    expect(event?.address).toBe("shop addr");
  });

  it("drops a row with no event id or name", () => {
    expect(projectEventRow(eventRow({ activityShopId: null }))).toBeNull();
    expect(projectEventRow(eventRow({ name: "" }))).toBeNull();
  });

  it("moves the hash when a projected field changes", () => {
    const base = projectEventRow(eventRow());
    const movedPlayers = projectEventRow(eventRow({ applyNum: 42 }));
    const movedStatus = projectEventRow(eventRow({ sortWeight: 4 }));

    expect(base?.contentHash).not.toBe(movedPlayers?.contentHash);
    expect(base?.contentHash).not.toBe(movedStatus?.contentHash);
  });

  it("separates a null field from an empty string in the same position", () => {
    const base = {
      activityShopId: 1,
      shopName: null,
      name: "A",
      activityType: null,
      activityTypeName: null,
      battleMode: null,
      status: null,
      startAt: null,
      endAt: null,
      playerCount: null,
      maxUser: null,
      fee: null,
      province: null,
      city: null,
      area: null,
      address: null,
      longitude: null,
      latitude: null,
    };
    expect(playloltcgContentHash(base)).not.toBe(
      playloltcgContentHash({ ...base, activityType: "", name: "" }),
    );
  });
});

describe("normalizeCardNo", () => {
  it("folds both separators and drops the set-total, matching short_code", () => {
    expect(normalizeCardNo("SFD·195/221")).toBe("SFD-195");
    expect(normalizeCardNo("SFD·057a/221")).toBe("SFD-057a");
    expect(normalizeCardNo("UNL-145a/219")).toBe("UNL-145a");
    expect(normalizeCardNo("VEN·038")).toBe("VEN-038");
  });

  it("returns null for a value that carries no code", () => {
    expect(normalizeCardNo("")).toBeNull();
    expect(normalizeCardNo(null)).toBeNull();
    expect(normalizeCardNo(42)).toBe("42");
  });
});

describe("referencedDeckIds", () => {
  it("collects each distinct cardGroupId once and ignores the deckless rows", () => {
    expect(
      referencedDeckIds([
        { cardGroupId: 7 },
        { cardGroupId: 7 },
        { cardGroupId: 0 },
        { cardGroupId: null },
        { name: "no group at all" },
        { cardGroupId: 9 },
      ]),
    ).toEqual(["7", "9"]);
  });
});

describe("unfetchedDeckIds", () => {
  it("names only the bodies the stored payload is still missing", () => {
    const raw = {
      standings: [{ cardGroupId: 1 }, { cardGroupId: 2 }, { cardGroupId: 3 }],
      decks: { "1": [{ cardNo: "SFD-195" }], "3": [] },
    };
    expect(unfetchedDeckIds(raw)).toEqual(["2"]);
  });

  it("treats a payload with no standings or no decks as nothing fetched", () => {
    expect(unfetchedDeckIds(null)).toEqual([]);
    expect(unfetchedDeckIds({ standings: [{ cardGroupId: 4 }] })).toEqual(["4"]);
  });
});

describe("projectDeckCard", () => {
  it("reads a card row and marks the legend by its category", () => {
    const card = projectDeckCard({
      cardNo: "SFD·195/221",
      cardName: "刀锋舞者",
      hero: "艾瑞莉娅",
      cardCount: 1,
      cardCategoryList: ["legendary"],
      isMainHero: false,
    });

    expect(card).toEqual({
      cardNo: "SFD·195/221",
      shortCode: "SFD-195",
      cardName: "刀锋舞者",
      hero: "艾瑞莉娅",
      cardCount: 1,
      isLegend: true,
      isMainHero: false,
    });
  });

  it("defaults the count to one and marks the champion unit", () => {
    const card = projectDeckCard({ cardNo: "OGN-001", cardCategoryList: [], isMainHero: true });
    expect(card?.cardCount).toBe(1);
    expect(card?.isLegend).toBe(false);
    expect(card?.isMainHero).toBe(true);
  });

  it("drops a row with no code", () => {
    expect(projectDeckCard({ cardName: "no code" })).toBeNull();
  });
});
