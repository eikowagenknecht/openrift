// oxlint-disable no-nodejs-modules -- this test introspects the source tree, so it must read files from disk
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { PAGE_WIDTH } from "./utils";

const SRC_DIR = join(import.meta.dirname, "..");

// Excludes component-level widths (max-w-sm/md/prose), which are not page
// columns.
const PAGE_COLUMN = /max-w-(?:2xl|3xl|4xl|5xl|6xl|7xl)\b/u;

// Component or marketing-layout widths that deliberately aren't a page width.
const EXEMPT = new Set([
  "components/deck/deck-builder-intro-banner.tsx",
  "components/deck/deck-mobile-dock.tsx",
  "components/landing/feature-showcase.tsx",
  "components/landing/landing-closing.tsx",
  "components/landing/landing-page.tsx",
  "components/promos/promo-compact-section.tsx",
  "components/promos/promo-section-divider.tsx",
]);

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listSourceFiles(path);
      }
      if (!entry.name.endsWith(".tsx") || entry.name.includes(".test.")) {
        return [];
      }
      return [path];
    }),
  );
  return files.flat();
}

describe("page widths", () => {
  it("offers exactly two", () => {
    expect(Object.keys(PAGE_WIDTH)).toStrictEqual(["full", "capped"]);
  });

  it("has no page hand-rolling a centered column instead of using PAGE_WIDTH", async () => {
    const files = await listSourceFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(SRC_DIR, file);
      if (EXEMPT.has(rel)) {
        continue;
      }
      const contents = await readFile(file, "utf-8");
      const lines = contents.split("\n");
      for (const [index, line] of lines.entries()) {
        if (line.includes("mx-auto") && PAGE_COLUMN.test(line)) {
          offenders.push(`${rel}:${index + 1}`);
        }
      }
    }
    expect(offenders).toStrictEqual([]);
  });
});
