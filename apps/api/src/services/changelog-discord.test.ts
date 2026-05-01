import { describe, expect, it, vi } from "vitest";

import {
  buildDiscordPayload,
  extractWatermark,
  parseChangelogSections,
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
  return vi.fn(async () => new Response("", { status: 200 })) as never;
}

describe("parseChangelogSections", () => {
  it("returns all sections sorted oldest first", () => {
    const sections = parseChangelogSections(SAMPLE_CHANGELOG);

    expect(sections.map((s) => s.date)).toEqual(["2026-04-07", "2026-04-08"]);
    expect(sections[0].entries).toHaveLength(2);
    expect(sections[1].entries).toHaveLength(3);
  });

  it("returns empty array for empty markdown", () => {
    expect(parseChangelogSections("")).toEqual([]);
  });

  it("ignores lines that do not match the entry pattern", () => {
    const markdown = `## 2026-04-08

- feat: Valid entry
Some random text
- not a valid prefix: something
- fix: Another valid entry
`;
    const sections = parseChangelogSections(markdown);

    expect(sections).toEqual([
      {
        date: "2026-04-08",
        entries: [
          { type: "feat", message: "Valid entry" },
          { type: "fix", message: "Another valid entry" },
        ],
      },
    ]);
  });

  it("drops sections with no feat/fix entries", () => {
    const markdown = `## 2026-04-08

just notes, no real entries

## 2026-04-09

- feat: real entry
`;
    const sections = parseChangelogSections(markdown);

    expect(sections.map((s) => s.date)).toEqual(["2026-04-09"]);
  });
});

describe("buildDiscordPayload", () => {
  it("builds payload with feats before fixes", () => {
    const payload = buildDiscordPayload("2026-04-08", [
      { type: "fix", message: "Fixed a bug" },
      { type: "feat", message: "Added a feature" },
      { type: "feat", message: "Another feature" },
    ]);

    expect(payload).toEqual({
      embeds: [
        {
          title: "What's new (2026-04-08)",
          description: "🆕 Added a feature\n🆕 Another feature\n🔧 Fixed a bug",
          color: 0x24_70_5f,
        },
      ],
    });
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
    const firstBody = JSON.parse(
      (fetcher as never as { mock: { calls: unknown[][] } }).mock.calls[0][1].body,
    );
    const secondBody = JSON.parse(
      (fetcher as never as { mock: { calls: unknown[][] } }).mock.calls[1][1].body,
    );
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
    ).rejects.toThrow(/Discord webhook 429/);

    expect(updateResult).toHaveBeenCalledTimes(1);
    expect(updateResult).toHaveBeenLastCalledWith("run-1", {
      posted: 1,
      lastPostedDate: "2026-04-07",
    });
  });
});
