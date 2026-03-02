import { describe, expect, it } from "vitest";

import { parseChangelog } from "./changelog";

describe("parseChangelog", () => {
  it("parses a single section with feat and fix entries", () => {
    const md = `## 2025-06-01

- feat: Cards are grouped by set
- fix: App updates now show up faster on iOS`;

    const result = parseChangelog(md);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-06-01");
    expect(result[0].entries).toEqual([
      { date: "2025-06-01", type: "feat", message: "Cards are grouped by set" },
      { date: "2025-06-01", type: "fix", message: "App updates now show up faster on iOS" },
    ]);
  });

  it("parses multiple sections", () => {
    const md = `## 2025-06-15

- feat: New feature

## 2025-06-01

- fix: Old bug fixed`;

    const result = parseChangelog(md);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2025-06-15");
    expect(result[1].date).toBe("2025-06-01");
  });

  it("skips sections with no valid entries", () => {
    const md = `## 2025-06-01

Some random text that isn't an entry

## 2025-05-01

- feat: A real entry`;

    const result = parseChangelog(md);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-05-01");
  });

  it("ignores lines that don't match the entry pattern", () => {
    const md = `## 2025-06-01

- feat: Valid entry
- chore: This won't match
- Not a valid line
- fix: Another valid entry`;

    const result = parseChangelog(md);
    expect(result[0].entries).toHaveLength(2);
    expect(result[0].entries[0].type).toBe("feat");
    expect(result[0].entries[1].type).toBe("fix");
  });

  it("returns empty array for empty string", () => {
    expect(parseChangelog("")).toEqual([]);
  });

  it("returns empty array for text with no ## headings", () => {
    expect(parseChangelog("just some text\nno headings")).toEqual([]);
  });

  it("handles content before the first ## heading", () => {
    const md = `# Changelog

Some preamble text

## 2025-06-01

- feat: Entry after preamble`;

    const result = parseChangelog(md);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-06-01");
  });
});
