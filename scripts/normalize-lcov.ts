/* oxlint-disable import/no-nodejs-modules -- standalone script */
/**
 * Bun coverage writes SF: paths relative to each package's directory, so the
 * same file can appear under two different relative paths and
 * lcov-result-merger treats them as separate entries. Rewrite them
 * repo-root-relative, in place.
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
  const packageRoot = findPackageRoot(lcovDir);
  const content = readFileSync(lcovPath, "utf-8");

  const normalized = content.replaceAll(/^SF:(?<path>.+)$/gmu, (_match, filePath: string) => {
    const absolute = resolve(packageRoot, filePath);
    const rootRelative = relative(repoRoot, absolute);
    return `SF:${rootRelative}`;
  });

  writeFileSync(lcovPath, normalized);
}
