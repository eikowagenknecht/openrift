import { describe, expect, it, vi } from "vitest";

import type { Fetch } from "../io.js";
import {
  buildDiscordPayloads,
  extractWatermark,
  postChangelogToDiscord,
} from "./changelog-discord.js";

const SAMPLE_CHANGELOG = `# Changelog

## 2026-04-08

- feat: Card pages can now show prices and breadcrumb trails in Google search results
- feat: Each card now has its own dedicated page at /cards/{name}
- fix: Footer on the collections page is no longer hidden below the viewport

## 2026-04-07

- feat: Collection import now supports re-importing your own OpenRift CSV exports
- fix: Search bar in copies view now shows the total number of copies
`;

const noopLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: () => noopLog,
} as never;

function makeJobRunsStub() {
  return { updateResult: vi.fn(async () => {}) } as never;
}

function makeOkFetcher() {
  return vi.fn<Fetch>(async () => new Response("", { status: 200 }));
}

describe("buildDiscordPayloads", () => {
  it("builds a single payload with feats before fixes when entries fit", () => {
    const payloads = buildDiscordPayloads("2026-04-08", [
      { date: "2026-04-08", type: "fix", section: "other", message: "Fixed a bug" },
      { date: "2026-04-08", type: "feat", section: "other", message: "Added a feature" },
      { date: "2026-04-08", type: "feat", section: "other", message: "Another feature" },
    ]);

    expect(payloads).toEqual([
      {
        embeds: [
          {
            title: "What's new (2026-04-08)",
            description: "🆕 Added a feature\n🆕 Another feature\n🔧 Fixed a bug",
            color: 0x24_70_5f,
          },
        ],
      },
    ]);
  });

  it("labels Highlights and Other blocks when highlights are present", () => {
    const payloads = buildDiscordPayloads("2026-06-16", [
      {
        date: "2026-06-16",
        type: "feat",
        section: "highlight",
        title: "Big thing",
        message: "matters",
      },
      {
        date: "2026-06-16",
        type: "feat",
        section: "other",
        title: "Small thing",
        message: "minor",
      },
      { date: "2026-06-16", type: "fix", section: "other", title: "A fix", message: "fixed" },
    ]);

    expect(payloads[0]!.embeds[0]!.description).toBe(
      "__Highlights__\n🆕 **Big thing**: matters\n\n__Other__\n🆕 **Small thing**: minor\n🔧 **A fix**: fixed",
    );
  });

  it("splits entries into multiple payloads when description would exceed Discord's 4096 limit", () => {
    const longEntry = {
      date: "2026-04-18",
      type: "feat" as const,
      section: "other" as const,
      message: "x".repeat(500),
    };
    const payloads = buildDiscordPayloads(
      "2026-04-18",
      Array.from({ length: 10 }, () => longEntry),
    );

    expect(payloads.length).toBeGreaterThan(1);
    for (const payload of payloads) {
      expect(payload.embeds[0]!.title).toBe("What's new (2026-04-18)");
      expect(payload.embeds[0]!.description.length).toBeLessThanOrEqual(4096);
    }
    const recombined = payloads.map((p) => p.embeds[0]!.description).join("\n");
    expect(recombined.split("\n")).toHaveLength(10);
  });
});

describe("extractWatermark", () => {
  it("returns the lastPostedDate string from a result object", () => {
    expect(extractWatermark({ lastPostedDate: "2026-04-08", posted: 1 })).toBe("2026-04-08");
  });

  it("returns null for missing or non-string lastPostedDate", () => {
    expect(extractWatermark(null)).toBeNull();
    expect(extractWatermark({})).toBeNull();
    expect(extractWatermark({ lastPostedDate: null })).toBeNull();
    expect(extractWatermark({ lastPostedDate: 42 })).toBeNull();
    expect(extractWatermark("string")).toBeNull();
  });
});

describe("postChangelogToDiscord", () => {
  const baseParams = {
    webhookUrl: "https://discord.test/webhook",
    changelogPath: "apps/web/src/CHANGELOG.md",
    runId: "run-1",
    log: noopLog,
    postDelayMs: 0,
    sleeper: vi.fn(async () => {}),
    readFile: async () => SAMPLE_CHANGELOG,
  };

  it("returns early without posting when webhook is not configured", async () => {
    const fetcher = makeOkFetcher();
    const jobRuns = makeJobRunsStub();

    const result = await postChangelogToDiscord({
      ...baseParams,
      webhookUrl: null,
      jobRuns,
      fromDate: "2026-04-07",
      fetcher,
    });

    expect(result).toEqual({ posted: 0, lastPostedDate: "2026-04-07" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts every section oldest first when no watermark is set (backfill case)", async () => {
    const fetcher = makeOkFetcher();
    const jobRuns = makeJobRunsStub();

    const result = await postChangelogToDiscord({
      ...baseParams,
      jobRuns,
      fromDate: null,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetcher.mock.calls[0]![1] as { body: string }).body);
    const secondBody = JSON.parse((fetcher.mock.calls[1]![1] as { body: string }).body);
    expect(firstBody.embeds[0].title).toBe("What's new (2026-04-07)");
    expect(secondBody.embeds[0].title).toBe("What's new (2026-04-08)");
    expect(result).toEqual({ posted: 2, lastPostedDate: "2026-04-08" });
  });

  it("posts only sections strictly newer than the watermark", async () => {
    const fetcher = makeOkFetcher();
    const jobRuns = makeJobRunsStub();

    const result = await postChangelogToDiscord({
      ...baseParams,
      jobRuns,
      fromDate: "2026-04-07",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ posted: 1, lastPostedDate: "2026-04-08" });
  });

  it("returns 0 posted when watermark is at or past the latest section", async () => {
    const fetcher = makeOkFetcher();
    const jobRuns = makeJobRunsStub();

    const result = await postChangelogToDiscord({
      ...baseParams,
      jobRuns,
      fromDate: "2026-04-08",
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({ posted: 0, lastPostedDate: "2026-04-08" });
  });

  it("checkpoints the watermark after each successful post", async () => {
    const fetcher = makeOkFetcher();
    const updateResult = vi.fn(async () => {});
    const jobRuns = { updateResult } as never;

    await postChangelogToDiscord({
      ...baseParams,
      jobRuns,
      fromDate: null,
      fetcher,
    });

    expect(updateResult).toHaveBeenCalledTimes(2);
    expect(updateResult).toHaveBeenNthCalledWith(1, "run-1", {
      posted: 1,
      lastPostedDate: "2026-04-07",
    });
    expect(updateResult).toHaveBeenNthCalledWith(2, "run-1", {
      posted: 2,
      lastPostedDate: "2026-04-08",
    });
  });

  it("waits between posts but not before the first one", async () => {
    const fetcher = makeOkFetcher();
    const jobRuns = makeJobRunsStub();
    const sleeper = vi.fn(async () => {});

    await postChangelogToDiscord({
      ...baseParams,
      jobRuns,
      fromDate: null,
      fetcher,
      sleeper,
      postDelayMs: 3000,
    });

    expect(sleeper).toHaveBeenCalledTimes(1);
    expect(sleeper).toHaveBeenCalledWith(3000);
  });

  it("posts multiple webhooks for a section that exceeds the embed limit, advancing watermark only once", async () => {
    const longLine = `- feat: ${"x".repeat(500)}`;
    const longBlock = Array.from({ length: 10 }, () => longLine).join("\n");
    const longChangelog = `# Changelog

## 2026-04-18

${longBlock}
`;
    const fetcher = makeOkFetcher();
    const updateResult = vi.fn(async () => {});
    const jobRuns = { updateResult } as never;

    const result = await postChangelogToDiscord({
      ...baseParams,
      jobRuns,
      fromDate: null,
      fetcher,
      readFile: async () => longChangelog,
    });

    const callCount = (fetcher as never as { mock: { calls: unknown[][] } }).mock.calls.length;
    expect(callCount).toBeGreaterThan(1);
    expect(updateResult).toHaveBeenCalledTimes(1);
    expect(updateResult).toHaveBeenCalledWith("run-1", {
      posted: 1,
      lastPostedDate: "2026-04-18",
    });
    expect(result).toEqual({ posted: 1, lastPostedDate: "2026-04-18" });
  });

  it("throws after a failed post so already-checkpointed work is preserved", async () => {
    let call = 0;
    const fetcher = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response("", { status: 200 });
      }
      return new Response("rate limited", { status: 429 });
    }) as never;
    const updateResult = vi.fn(async () => {});
    const jobRuns = { updateResult } as never;

    await expect(
      postChangelogToDiscord({
        ...baseParams,
        jobRuns,
        fromDate: null,
        fetcher,
      }),
    ).rejects.toThrow(/Discord webhook 429/u);

    expect(updateResult).toHaveBeenCalledTimes(1);
    expect(updateResult).toHaveBeenLastCalledWith("run-1", {
      posted: 1,
      lastPostedDate: "2026-04-07",
    });
  });
});
