// oxlint-disable no-nodejs-modules -- this test introspects the source tree, so it must read files from disk
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_DIR = join(import.meta.dirname, "..");

// Directories that contain persist()-backed Zustand state: every stores/ plus
// the persist()-wrapped hooks like use-admin-settings, top level and per feature.
async function scannedDirs(): Promise<string[]> {
  const dirs = [join(SRC_DIR, "stores"), join(SRC_DIR, "hooks")];
  const features = await readdir(join(SRC_DIR, "features"), { withFileTypes: true });
  for (const feature of features) {
    if (!feature.isDirectory()) {
      continue;
    }
    dirs.push(
      join(SRC_DIR, "features", feature.name, "stores"),
      join(SRC_DIR, "features", feature.name, "hooks"),
    );
  }
  return dirs;
}

// A `version:` property key on its own line, as it would appear in persist()
// options. Deliberately line-anchored so prose mentions in comments don't match.
const VERSION_OPTION = /^\s*version\s*:/mu;

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.includes(".test."),
    )
    .map((entry) => join(dir, entry.name));
}

describe("persisted Zustand stores", () => {
  it("never set the zustand persist `version` option", async () => {
    const offenders: string[] = [];
    for (const dir of await scannedDirs()) {
      for (const file of await listSourceFiles(dir)) {
        const contents = await readFile(file, "utf-8");
        if (contents.includes("persist(") && VERSION_OPTION.test(contents)) {
          offenders.push(file);
        }
      }
    }
    expect(
      offenders,
      "Persisted stores must not set a persist() `version`: users run stale cached bundles " +
        "after a deploy, and an older bundle (implicit version 0, no migrate) that rehydrates " +
        "a newer-versioned blob DISCARDS the whole blob — the exact data loss versioning looks " +
        "like it prevents. Absorb shape changes in the store's defensive `merge` instead; see " +
        "local-decks-store.ts for the original rationale and CLAUDE.md (Conventions) for options.",
    ).toEqual([]);
  });
});
