/* oxlint-disable import/no-nodejs-modules -- standalone script */
/**
 * Normalize SF: paths in lcov files to be repo-root-relative.
 *
 * Bun coverage writes paths relative to each package's directory, so the same
 * file can appear as e.g. `src/filters.ts` (from packages/shared) and
 * `../../packages/shared/src/filters.ts` (from apps/api). This causes
 * lcov-result-merger to treat them as separate entries instead of combining
 * hit counts.
 *
 * Usage: bun scripts/normalize-lcov.ts <lcov-file> [<lcov-file> ...]
 * Rewrites each file in-place.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");

function findPackageRoot(from: string): string {
  let dir = resolve(from);
  while (dir !== "/") {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return from;
}

for (const lcovPath of process.argv.slice(2)) {
  const lcovDir = dirname(resolve(lcovPath));
  // Bun writes SF: paths relative to the package root (cwd of bun test),
  // not relative to the coverage directory.
  const packageRoot = findPackageRoot(lcovDir);
  const content = readFileSync(lcovPath, "utf8");

  const normalized = content.replaceAll(/^SF:(.+)$/gm, (_match, filePath: string) => {
    const absolute = resolve(packageRoot, filePath);
    const rootRelative = relative(repoRoot, absolute);
    return `SF:${rootRelative}`;
  });

  writeFileSync(lcovPath, normalized);
}
