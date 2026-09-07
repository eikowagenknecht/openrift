import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type { TradeMatchDigestDeps } from "./trade-match-digest.js";
import {
  extractDigestWatermark,
  isTradeMatchDigestNoop,
  sendTradeMatchDigest,
} from "./trade-match-digest.js";

describe("extractDigestWatermark", () => {
  it("reads a valid ISO timestamp from the stored result", () => {
    const iso = "2026-06-17T08:00:00.000Z";
    const watermark = extractDigestWatermark({ lastRunAt: iso });
    expect(watermark).toEqual(new Date(iso));
  });

  it("returns null when there is no prior result", () => {
    expect(extractDigestWatermark(null)).toBeNull();
    expect(extractDigestWatermark(undefined)).toBeNull();
  });

  it("returns null when the result lacks a usable lastRunAt", () => {
    expect(extractDigestWatermark({})).toBeNull();
    expect(extractDigestWatermark({ lastRunAt: 12_345 })).toBeNull();
    expect(extractDigestWatermark({ lastRunAt: "not-a-date" })).toBeNull();
    expect(extractDigestWatermark("string")).toBeNull();
  });
});

describe("isTradeMatchDigestNoop", () => {
  it("is a no-op when no recipient was emailed and no match was included", () => {
    expect(
      isTradeMatchDigestNoop({
        recipients: 0,
        emailsSent: 0,
        matches: 0,
        failed: 0,
        matchesDropped: 0,
      }),
    ).toBe(true);
  });

  it("did work when at least one digest email went out", () => {
    expect(
      isTradeMatchDigestNoop({
        recipients: 4,
        emailsSent: 2,
        matches: 9,
        failed: 0,
        matchesDropped: 0,
      }),
    ).toBe(false);
  });

  it("is not a no-op when every send failed", () => {
    expect(
      isTradeMatchDigestNoop({
        recipients: 2,
        emailsSent: 0,
        matches: 0,
        failed: 2,
        matchesDropped: 5,
      }),
    ).toBe(false);
  });
});

/** Stubbed repos covering only what the digest reads: two recipients, one group each, one new match each. */
function digestRepos(): Repos {
  return {
    siteSettings: { getBool: async () => true },
    userPreferences: {
      listMatchDigestRecipients: async () => [
        { userId: "user-1", email: "one@example.test", name: "One" },
        { userId: "user-2", email: "two@example.test", name: "Two" },
      ],
    },
    friendGroups: {
      listGroupsForUser: async () => [
        { id: "group-1", name: "Summoner Skirmish", slug: "skirmish" },
      ],
      listMembers: async () => [{ userId: "user-9", userName: "Nine" }],
    },
    friendGroupMatches: {
      recentIncomingMatchesForFeed: async () => [
        {
          counterpartyUserId: "user-9",
          counterpartyName: "Nine",
          counterpartyImage: null,
          counterpartyGravatarHash: "hash",
          printingId: "printing-1",
          cardId: "card-1",
          matchedAt: new Date("2026-06-18T10:00:00.000Z"),
        },
      ],
    },
    catalog: {
      cardsByIds: async () => [{ id: "card-1", name: "Jinx" }],
    },
  } as unknown as Repos;
}

function digestDeps(sendEmail: TradeMatchDigestDeps["sendEmail"]): TradeMatchDigestDeps {
  return {
    repos: digestRepos(),
    log: { error: vi.fn() } as unknown as TradeMatchDigestDeps["log"],
    sendEmail,
    appBaseUrl: "https://example.test",
    unsubscribeSecret: "test-secret",
    sinceTimestamp: new Date("2026-06-17T00:00:00.000Z"),
  };
}

describe("sendTradeMatchDigest", () => {
  it("counts failed sends and the matches dropped with them", async () => {
    const sendEmail = vi.fn(() => Promise.reject(new Error("SMTP down")));
    const result = await sendTradeMatchDigest(
      digestDeps(sendEmail as unknown as TradeMatchDigestDeps["sendEmail"]),
    );

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      recipients: 2,
      emailsSent: 0,
      matches: 0,
      failed: 2,
      matchesDropped: 2,
    });
  });

  it("reports no failures when every send succeeds", async () => {
    const sendEmail = vi.fn(() => Promise.resolve());
    const result = await sendTradeMatchDigest(
      digestDeps(sendEmail as unknown as TradeMatchDigestDeps["sendEmail"]),
    );

    expect(result).toEqual({
      recipients: 2,
      emailsSent: 2,
      matches: 2,
      failed: 0,
      matchesDropped: 0,
    });
  });
});
