import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type { CoalescedRequestFlushDeps } from "./trade-notifications.js";
import {
  flushCoalescedTradeRequests,
  isRequestGroupDue,
  isTradeRequestFlushNoop,
} from "./trade-notifications.js";

const NOW = new Date("2026-06-18T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe("isRequestGroupDue", () => {
  it("is always due on the instant cadence, even for a fresh request", () => {
    expect(isRequestGroupDue("instant", [minutesAgo(0)], NOW)).toBe(true);
  });

  it("is not due while a timed burst is still inside its window", () => {
    expect(isRequestGroupDue("5min", [minutesAgo(4), minutesAgo(2)], NOW)).toBe(false);
  });

  it("is due once a timed burst has been quiet for the full window", () => {
    expect(isRequestGroupDue("5min", [minutesAgo(6)], NOW)).toBe(true);
  });

  it("fires at the 2x-window cap even when requests keep arriving", () => {
    expect(isRequestGroupDue("5min", [minutesAgo(11), minutesAgo(1)], NOW)).toBe(true);
  });

  it("is not due for an empty timed group", () => {
    expect(isRequestGroupDue("15min", [], NOW)).toBe(false);
  });
});

describe("isTradeRequestFlushNoop", () => {
  it("is a no-op when nothing was due, sent, or folded in", () => {
    expect(
      isTradeRequestFlushNoop({
        pairs: 0,
        emailsSent: 0,
        requests: 0,
        failed: 0,
        requestsDropped: 0,
      }),
    ).toBe(true);
  });

  it("did work when an email was sent", () => {
    expect(
      isTradeRequestFlushNoop({
        pairs: 1,
        emailsSent: 1,
        requests: 3,
        failed: 0,
        requestsDropped: 0,
      }),
    ).toBe(false);
  });

  it("did work when a pair was due even if the send was gated to zero emails", () => {
    expect(
      isTradeRequestFlushNoop({
        pairs: 2,
        emailsSent: 0,
        requests: 5,
        failed: 0,
        requestsDropped: 0,
      }),
    ).toBe(false);
  });
});

function flushRepos(): Repos {
  const rows = [1, 2].map((n) => ({
    id: `trade-${n}`,
    groupId: "group-1",
    groupSlug: "skirmish",
    groupName: "Summoner Skirmish",
    cardId: "card-1",
    printingId: "printing-1",
    quantity: 1,
    initiator: "receiver" as const,
    senderUserId: "user-9",
    recipientUserId: "user-1",
    createdAt: minutesAgo(30),
  }));

  return {
    siteSettings: { getBool: async () => true },
    cardTrades: {
      listPendingRequestEmails: async () => rows,
      claimRequestEmails: async (ids: string[]) => ids,
    },
    userPreferences: {
      getEmailNotificationContext: async () => ({
        email: "one@example.test",
        emailVerified: true,
        name: "One",
        emailNotifications: { tradeRequests: true, tradeRequestCadence: "instant" },
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

function flushDeps(sendEmail: CoalescedRequestFlushDeps["sendEmail"]): CoalescedRequestFlushDeps {
  return {
    repos: flushRepos(),
    log: { error: vi.fn() } as unknown as CoalescedRequestFlushDeps["log"],
    sendEmail,
    appBaseUrl: "https://example.test",
    unsubscribeSecret: "test-secret",
  };
}

describe("flushCoalescedTradeRequests", () => {
  it("counts the failed send and the claimed requests dropped with it", async () => {
    const sendEmail = vi.fn(() => Promise.reject(new Error("SMTP down")));
    const result = await flushCoalescedTradeRequests(
      flushDeps(sendEmail as unknown as CoalescedRequestFlushDeps["sendEmail"]),
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      pairs: 1,
      emailsSent: 0,
      requests: 0,
      failed: 1,
      requestsDropped: 2,
    });
  });

  it("reports no failures when the send succeeds", async () => {
    const sendEmail = vi.fn(() => Promise.resolve());
    const result = await flushCoalescedTradeRequests(
      flushDeps(sendEmail as unknown as CoalescedRequestFlushDeps["sendEmail"]),
    );

    expect(result).toEqual({
      pairs: 1,
      emailsSent: 1,
      requests: 2,
      failed: 0,
      requestsDropped: 0,
    });
  });
});
