import { describe, expect, it } from "vitest";

import type { CardTradeLivePhaseFields, CardTradeStateFields } from "./card-trade-lifecycle.js";
import {
  cardTradeLivePhase,
  cardTradeState,
  isLiveCardTradeStatus,
  isTradedCardTrade,
  needsViewerAction,
  TRADED_CARD_TRADE_STATUSES,
} from "./card-trade-lifecycle.js";

function trade(overrides: Partial<CardTradeStateFields> = {}): CardTradeStateFields {
  return { status: "pending", actionNeeded: null, viewerSyncAppliedAt: null, ...overrides };
}

describe("cardTradeState", () => {
  it("reads the viewer's own two acts off actionNeeded", () => {
    expect(cardTradeState(trade({ actionNeeded: "accept-or-decline" }))).toBe("to-answer");
    expect(cardTradeState(trade({ status: "reserved", actionNeeded: "settle" }))).toBe("to-settle");
  });

  it("treats a request the viewer sent as waiting on the other side", () => {
    expect(cardTradeState(trade({ actionNeeded: "cancel" }))).toBe("waiting-on-them");
  });

  it("calls a reservation the viewer has settled done, not waiting", () => {
    expect(
      cardTradeState(
        trade({
          status: "reserved",
          actionNeeded: null,
          viewerSyncAppliedAt: "2026-08-08T10:00:00.000Z",
        }),
      ),
    ).toBe("done");
  });

  it("keeps an unsettled reservation waiting even without an actionNeeded", () => {
    expect(cardTradeState(trade({ status: "reserved", actionNeeded: null }))).toBe(
      "waiting-on-them",
    );
  });

  it("calls a completed trade done and the three failure endings closed", () => {
    expect(cardTradeState(trade({ status: "completed" }))).toBe("done");
    for (const status of ["declined", "cancelled", "expired"] as const) {
      expect(cardTradeState(trade({ status }))).toBe("closed");
    }
  });

  it("lets a pending settle win over a completed status", () => {
    expect(cardTradeState(trade({ status: "completed", actionNeeded: "settle" }))).toBe(
      "to-settle",
    );
  });
});

describe("needsViewerAction", () => {
  it("is true for both of the viewer's acts and nothing else", () => {
    expect(needsViewerAction(trade({ actionNeeded: "accept-or-decline" }))).toBe(true);
    expect(needsViewerAction(trade({ status: "reserved", actionNeeded: "settle" }))).toBe(true);
    expect(needsViewerAction(trade({ actionNeeded: "cancel" }))).toBe(false);
    expect(needsViewerAction(trade({ status: "completed" }))).toBe(false);
  });
});

describe("isTradedCardTrade", () => {
  it("counts a completed trade and a reservation the viewer settled", () => {
    expect(isTradedCardTrade(trade({ status: "completed" }))).toBe(true);
    expect(
      isTradedCardTrade(
        trade({ status: "reserved", viewerSyncAppliedAt: "2026-08-08T10:00:00.000Z" }),
      ),
    ).toBe(true);
  });

  it("does not count a cancelled trade that carries a settle", () => {
    expect(
      isTradedCardTrade(
        trade({ status: "cancelled", viewerSyncAppliedAt: "2026-08-08T10:00:00.000Z" }),
      ),
    ).toBe(false);
  });

  it("does not count a swap the viewer still owes a settle on", () => {
    expect(isTradedCardTrade(trade({ status: "reserved", actionNeeded: "settle" }))).toBe(false);
  });
});

describe("cardTradeLivePhase", () => {
  function live(overrides: Partial<CardTradeLivePhaseFields> = {}): CardTradeLivePhaseFields {
    return { status: "pending", initiator: "receiver", viewerSyncAppliedAt: null, ...overrides };
  }

  it("reads a pending trade's phase off who opened it", () => {
    expect(cardTradeLivePhase(live())).toBe("asked");
    expect(cardTradeLivePhase(live({ initiator: "giver" }))).toBe("offered");
  });

  it("calls an accepted trade reserved for both sides", () => {
    expect(cardTradeLivePhase(live({ status: "reserved" }))).toBe("reserved");
    expect(cardTradeLivePhase(live({ status: "reserved", initiator: "giver" }))).toBe("reserved");
  });

  it("drops the viewer's half once they have settled it", () => {
    expect(
      cardTradeLivePhase(live({ status: "reserved", viewerSyncAppliedAt: "2026-08-02T00:00:00Z" })),
    ).toBeNull();
  });

  it("gives a terminal trade no phase", () => {
    for (const status of ["completed", "declined", "cancelled", "expired"] as const) {
      expect(cardTradeLivePhase(live({ status }))).toBeNull();
    }
  });
});

describe("status sets", () => {
  it("treats only pending and reserved as live", () => {
    expect(isLiveCardTradeStatus("pending")).toBe(true);
    expect(isLiveCardTradeStatus("reserved")).toBe(true);
    expect(isLiveCardTradeStatus("completed")).toBe(false);
    expect(isLiveCardTradeStatus("cancelled")).toBe(false);
  });

  // Guards the SQL twin in `countCompletedCardsInGroup`, which filters on this
  // list to keep cancelled-with-a-settle rows out of the lifetime stat.
  it("excludes every failure ending from the traded statuses", () => {
    expect([...TRADED_CARD_TRADE_STATUSES]).toEqual(["reserved", "completed"]);
  });
});
