import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type { TradeStatusFlushDeps } from "./trade-status-notifications.js";
import { flushTradeStatusEmails, isTradeStatusFlushNoop } from "./trade-status-notifications.js";

describe("isTradeStatusFlushNoop", () => {
  it("is a no-op when nothing was due, sent, or folded in", () => {
    expect(
      isTradeStatusFlushNoop({ pairs: 0, emailsSent: 0, events: 0, failed: 0, eventsDropped: 0 }),
    ).toBe(true);
  });

  it("did work when an email was sent", () => {
    expect(
      isTradeStatusFlushNoop({ pairs: 1, emailsSent: 1, events: 2, failed: 0, eventsDropped: 0 }),
    ).toBe(false);
  });

  it("did work when every send failed", () => {
    expect(
      isTradeStatusFlushNoop({ pairs: 1, emailsSent: 0, events: 0, failed: 1, eventsDropped: 2 }),
    ).toBe(false);
  });
});

/** One due pair (instant cadence) with a reserved and a declined event.
 *  @returns Stubbed repos covering only what the flush reads. */
function statusRepos(): Repos {
  const rows = [
    { id: "trade-1", event: "reserved" as const },
    { id: "trade-2", event: "declined" as const },
  ].map((row) => ({
    ...row,
    groupId: "group-1",
    groupSlug: "skirmish",
    groupName: "Summoner Skirmish",
    cardId: "card-1",
    quantity: 1,
    actorUserId: "user-9",
    recipientUserId: "user-1",
    eventAt: new Date("2026-06-18T11:00:00.000Z"),
  }));

  return {
    siteSettings: { getBool: async () => true },
    cardTrades: {
      listPendingStatusEmails: async () => rows,
      claimStatusEmails: async (_marker: string, ids: string[]) => ids,
    },
    userPreferences: {
      getEmailNotificationContext: async () => ({
        email: "one@example.test",
        emailVerified: true,
        name: "One",
        emailNotifications: { tradeStatus: true, tradeRequestCadence: "instant" },
      }),
    },
    friendGroups: {
      listMembers: async () => [{ userId: "user-9", userName: "Nine" }],
    },
    catalog: {
      cardsByIds: async () => [{ id: "card-1", name: "Jinx" }],
    },
  } as unknown as Repos;
}

function statusDeps(sendEmail: TradeStatusFlushDeps["sendEmail"]): TradeStatusFlushDeps {
  return {
    repos: statusRepos(),
    log: { error: vi.fn() } as unknown as TradeStatusFlushDeps["log"],
    sendEmail,
    appBaseUrl: "https://example.test",
    unsubscribeSecret: "test-secret",
  };
}

describe("flushTradeStatusEmails", () => {
  it("counts the failed send and the claimed transitions dropped with it", async () => {
    const sendEmail = vi.fn(() => Promise.reject(new Error("SMTP down")));
    const result = await flushTradeStatusEmails(
      statusDeps(sendEmail as unknown as TradeStatusFlushDeps["sendEmail"]),
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    // The rows stay claimed (at-most-once), so both transitions are lost.
    expect(result).toEqual({
      pairs: 1,
      emailsSent: 0,
      events: 0,
      failed: 1,
      eventsDropped: 2,
    });
  });

  it("reports no failures when the send succeeds", async () => {
    const sendEmail = vi.fn(() => Promise.resolve());
    const result = await flushTradeStatusEmails(
      statusDeps(sendEmail as unknown as TradeStatusFlushDeps["sendEmail"]),
    );

    expect(result).toEqual({
      pairs: 1,
      emailsSent: 1,
      events: 2,
      failed: 0,
      eventsDropped: 0,
    });
  });
});
