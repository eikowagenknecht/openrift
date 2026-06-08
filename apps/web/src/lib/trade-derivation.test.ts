import type { CardTradeResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  maxTradeQuantity,
  tradeSection,
  tradeStatusLabel,
  withoutLiveTradeMatches,
} from "./trade-derivation";

function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "the-group",
    role: "receiver",
    initiator: "receiver",
    counterparty: {
      userId: "user-2",
      name: "Robin",
      image: null,
      gravatarHash: "hash",
      nickname: null,
    },
    printingId: "printing-1",
    cardId: "card-1",
    quantity: 1,
    status: "pending",
    createdAt: "2026-05-29T10:00:00.000Z",
    updatedAt: "2026-05-29T10:00:00.000Z",
    acceptedAt: null,
    completedAt: null,
    closedAt: null,
    expiresAt: null,
    viewerSyncAppliedAt: null,
    counterpartySyncAppliedAt: null,
    actionNeeded: null,
    ...overrides,
  };
}

describe("tradeSection", () => {
  it("buckets a request awaiting the viewer into action-needed", () => {
    expect(tradeSection(stubTrade({ status: "pending", actionNeeded: "accept-or-decline" }))).toBe(
      "action-needed",
    );
  });

  it("buckets an unresolved completed sync into action-needed", () => {
    expect(tradeSection(stubTrade({ status: "completed", actionNeeded: "apply-sync" }))).toBe(
      "action-needed",
    );
  });

  it("buckets the viewer's own pending request into active", () => {
    expect(tradeSection(stubTrade({ status: "pending", actionNeeded: "cancel" }))).toBe("active");
  });

  it("buckets a reserved trade into active", () => {
    expect(tradeSection(stubTrade({ status: "reserved", actionNeeded: "complete" }))).toBe(
      "active",
    );
  });

  it("buckets a resolved completed trade into history", () => {
    expect(tradeSection(stubTrade({ status: "completed", actionNeeded: null }))).toBe("history");
  });

  it("buckets terminal trades into history", () => {
    for (const status of ["declined", "cancelled", "expired"] as const) {
      expect(tradeSection(stubTrade({ status, actionNeeded: null }))).toBe("history");
    }
  });
});

describe("maxTradeQuantity", () => {
  it("caps at the demand when supply exceeds it (offer more than they want)", () => {
    // They want 1 but you have 5 — you can only trade 1, not 5 (the reported bug).
    expect(maxTradeQuantity(1, 5)).toBe(1);
  });

  it("caps at the available count when demand exceeds supply", () => {
    expect(maxTradeQuantity(5, 3)).toBe(3);
  });

  it("equals the demand when supply covers it", () => {
    expect(maxTradeQuantity(3, 5)).toBe(3);
  });

  it("returns 0 when nothing is available", () => {
    expect(maxTradeQuantity(3, 0)).toBe(0);
  });

  it("handles the single-copy boundary", () => {
    expect(maxTradeQuantity(1, 1)).toBe(1);
  });
});

describe("tradeStatusLabel", () => {
  it("maps each status to a human label", () => {
    expect(tradeStatusLabel("pending")).toBe("Pending");
    expect(tradeStatusLabel("reserved")).toBe("Reserved");
    expect(tradeStatusLabel("completed")).toBe("Completed");
    expect(tradeStatusLabel("declined")).toBe("Declined");
    expect(tradeStatusLabel("cancelled")).toBe("Cancelled");
    expect(tradeStatusLabel("expired")).toBe("Expired");
  });
});

describe("withoutLiveTradeMatches", () => {
  const match = (counterpartyUserId: string, printingId: string) => ({
    counterpartyUserId,
    printingId,
  });

  it("drops a match with a pending trade for the same member + printing", () => {
    const matches = [match("user-2", "printing-1")];
    const trades = [
      stubTrade({
        status: "pending",
        printingId: "printing-1",
        counterparty: {
          userId: "user-2",
          name: null,
          image: null,
          gravatarHash: "h",
          nickname: null,
        },
      }),
    ];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual([]);
  });

  it("drops a match with a reserved trade for the same member + printing", () => {
    const matches = [match("user-2", "printing-1")];
    const trades = [
      stubTrade({
        status: "reserved",
        printingId: "printing-1",
        counterparty: {
          userId: "user-2",
          name: null,
          image: null,
          gravatarHash: "h",
          nickname: null,
        },
      }),
    ];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual([]);
  });

  it("keeps a match when the live trade is for a different printing", () => {
    const matches = [match("user-2", "printing-1")];
    const trades = [stubTrade({ status: "reserved", printingId: "printing-OTHER" })];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual(matches);
  });

  it("keeps a match when the live trade is with a different member", () => {
    const matches = [match("user-2", "printing-1")];
    const trades = [
      stubTrade({
        status: "reserved",
        printingId: "printing-1",
        counterparty: {
          userId: "user-99",
          name: null,
          image: null,
          gravatarHash: "h",
          nickname: null,
        },
      }),
    ];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual(matches);
  });

  it("keeps a match when the only matching trade is terminal", () => {
    const matches = [match("user-2", "printing-1")];
    for (const status of ["completed", "declined", "cancelled", "expired"] as const) {
      const trades = [
        stubTrade({
          status,
          printingId: "printing-1",
          counterparty: {
            userId: "user-2",
            name: null,
            image: null,
            gravatarHash: "h",
            nickname: null,
          },
        }),
      ];
      expect(withoutLiveTradeMatches(matches, trades)).toEqual(matches);
    }
  });

  it("returns all matches when there are no trades", () => {
    const matches = [match("user-2", "printing-1"), match("user-3", "printing-2")];
    expect(withoutLiveTradeMatches(matches, [])).toEqual(matches);
  });

  it("filters only the matches with a live trade, keeping the rest", () => {
    const matches = [match("user-2", "printing-1"), match("user-3", "printing-2")];
    const trades = [
      stubTrade({
        status: "pending",
        printingId: "printing-1",
        counterparty: {
          userId: "user-2",
          name: null,
          image: null,
          gravatarHash: "h",
          nickname: null,
        },
      }),
    ];
    expect(withoutLiveTradeMatches(matches, trades)).toEqual([match("user-3", "printing-2")]);
  });
});
