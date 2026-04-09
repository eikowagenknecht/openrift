import { describe, expect, it } from "vitest";

import { buildDiscordPayload, parseChangelogForDate } from "./changelog-discord.js";

const SAMPLE_CHANGELOG = `# Changelog

## 2026-04-08

- feat: Card pages can now show prices and breadcrumb trails in Google search results
- feat: Each card now has its own dedicated page at /cards/{name}
- fix: Footer on the collections page is no longer hidden below the viewport

## 2026-04-07

- feat: Collection import now supports re-importing your own OpenRift CSV exports
- fix: Search bar in copies view now shows the total number of copies
`;

describe("parseChangelogForDate", () => {
  it("returns entries for a matching date", () => {
    const entries = parseChangelogForDate(SAMPLE_CHANGELOG, "2026-04-08");

    expect(entries).toEqual([
      {
        type: "feat",
        message: "Card pages can now show prices and breadcrumb trails in Google search results",
      },
      { type: "feat", message: "Each card now has its own dedicated page at /cards/{name}" },
      {
        type: "fix",
        message: "Footer on the collections page is no longer hidden below the viewport",
      },
    ]);
  });

  it("returns entries for a different date", () => {
    const entries = parseChangelogForDate(SAMPLE_CHANGELOG, "2026-04-07");

    expect(entries).toEqual([
      {
        type: "feat",
        message: "Collection import now supports re-importing your own OpenRift CSV exports",
      },
      { type: "fix", message: "Search bar in copies view now shows the total number of copies" },
    ]);
  });

  it("returns empty array when date has no entries", () => {
    const entries = parseChangelogForDate(SAMPLE_CHANGELOG, "2026-01-01");

    expect(entries).toEqual([]);
  });

  it("returns empty array for empty markdown", () => {
    const entries = parseChangelogForDate("", "2026-04-08");

    expect(entries).toEqual([]);
  });

  it("ignores lines that do not match the entry pattern", () => {
    const markdown = `# Changelog

## 2026-04-08

- feat: Valid entry
Some random text
- not a valid prefix: something
- fix: Another valid entry
`;
    const entries = parseChangelogForDate(markdown, "2026-04-08");

    expect(entries).toEqual([
      { type: "feat", message: "Valid entry" },
      { type: "fix", message: "Another valid entry" },
    ]);
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

  it("builds payload with only feats", () => {
    const payload = buildDiscordPayload("2026-04-08", [{ type: "feat", message: "New thing" }]);

    expect(payload.embeds[0].description).toBe("🆕 New thing");
  });

  it("builds payload with only fixes", () => {
    const payload = buildDiscordPayload("2026-04-08", [{ type: "fix", message: "Bug squashed" }]);

    expect(payload.embeds[0].description).toBe("🔧 Bug squashed");
  });
});
