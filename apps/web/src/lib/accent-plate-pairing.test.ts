// oxlint-disable no-nodejs-modules -- this test introspects the source tree, so it must read files from disk
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_DIR = join(import.meta.dirname, "..");

/**
 * A full-opacity `accent` background utility, under any variant prefix
 * (`hover:`, `focus:`, `data-checked:`, `[&>div:hover]:`, …).
 *
 * The negative lookahead keeps two lookalikes out: `bg-accent-foreground` is a
 * different token, and `bg-accent/40` is a tint rather than a solid plate, so
 * the text underneath it keeps most of its own contrast.
 */
const ACCENT_PLATE = /bg-accent(?![-/\w])/u;

/** The paired foreground token that makes an accent plate readable. */
const ACCENT_FOREGROUND = "accent-foreground";

/**
 * Lists the TypeScript sources under `apps/web/src`, minus tests and the
 * generated route tree.
 * @returns Absolute paths of the source files.
 */
async function listSourceFiles(): Promise<string[]> {
  const entries = await readdir(SRC_DIR, { recursive: true, withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.includes(".test.") &&
        entry.name !== "routeTree.gen.ts",
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("accent background plates", () => {
  it("always pair a full-opacity bg-accent with accent-foreground", async () => {
    const offenders: string[] = [];
    for (const file of await listSourceFiles()) {
      const contents = await readFile(file, "utf-8");
      // A surface wrapped in NEUTRAL_HOVER_SCOPE remaps --accent to --muted and
      // --accent-foreground to --foreground, so its bare `bg-accent` is already
      // the neutral highlight. The exemption is per file rather than per
      // element, which is coarse but keeps the check readable.
      if (contents.includes("NEUTRAL_HOVER_SCOPE")) {
        continue;
      }
      for (const [index, line] of contents.split("\n").entries()) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
          continue;
        }
        if (ACCENT_PLATE.test(line) && !line.includes(ACCENT_FOREGROUND)) {
          offenders.push(`${file}:${index + 1}`);
        }
      }
    }
    expect(
      offenders,
      "This app's default palette sets `accent === primary` — a bright gold in dark mode. A " +
        "solid `bg-accent` plate with no `text-accent-foreground` leaves the element's own " +
        "`foreground` (near white) and `text-muted-foreground` (grey) text sitting on gold, " +
        "which is what made the card page's printing rows and price table unreadable on hover. " +
        "Either pair the plate the way the ui/ menu primitives do " +
        "(`bg-accent text-accent-foreground`, plus `**:text-accent-foreground` when children " +
        "carry their own colour), or — for a plain row highlight — use `hover:bg-muted`, which " +
        "is the neutral hover the rest of the app uses.",
    ).toEqual([]);
  });
});
