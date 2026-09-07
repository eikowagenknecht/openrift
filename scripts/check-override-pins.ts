/* oxlint-disable import/no-nodejs-modules -- standalone script */
/**
 * Checks that every root `overrides` pin still matches the workspace or
 * companion-package version it exists to dedupe. Neither syncpack nor
 * Dependabot notices this drift (an npm: alias hides it from Dependabot
 * entirely), so a mismatch ships duplicate copies silently.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");

// Read from bun.lock, not node_modules — a squash-merge leaves it predating the commit.
const COMPANION_PINS = [
  {
    override: "@tanstack/query-core",
    declaredBy: "@tanstack/react-query",
  },
];

interface PackageJson {
  name?: string;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
}

interface LockFile {
  packages?: Record<string, unknown[]>;
}

function readPackageJson(path: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PackageJson;
  } catch {
    return null;
  }
}

/** `bun.lock` is JSON with trailing commas, which `JSON.parse` rejects. */
function readLockfile(path: string): LockFile | null {
  try {
    const text = readFileSync(path, "utf-8");
    // Match whole string literals first so a comma inside one is never stripped.
    const json = text.replaceAll(/"(?:[^"\\]|\\.)*"|,(?=\s*[}\]])/gu, (match) =>
      match.startsWith('"') ? match : "",
    );
    return JSON.parse(json) as LockFile;
  } catch {
    return null;
  }
}

/**
 * The dependency map inside a `bun.lock` entry, whose position differs between
 * registry packages (`[key, "", meta, hash]`) and workspaces (`[name, meta]`).
 */
function lockedDependencies(entry: unknown[]): Record<string, string> {
  for (const part of entry) {
    if (typeof part === "object" && part !== null && !Array.isArray(part)) {
      return (part as { dependencies?: Record<string, string> }).dependencies ?? {};
    }
  }
  return {};
}

const root = readPackageJson(resolve(repoRoot, "package.json"));
if (!root) {
  console.error("Could not read the root package.json.");
  process.exit(1);
}

const overrides = Object.entries(root.overrides ?? {});

const workspaces = new Map<string, PackageJson>();
for (const pattern of root.workspaces ?? []) {
  for (const match of new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: repoRoot })) {
    const relativePath = match.replaceAll("\\", "/");
    const pkg = readPackageJson(resolve(repoRoot, relativePath));
    if (pkg) {
      workspaces.set(relativePath, pkg);
    }
  }
}

if (workspaces.size === 0) {
  console.error(`No workspace package.json files found under ${repoRoot}.`);
  process.exit(1);
}

function pinsOf(name: string): [string, string][] {
  const found: [string, string][] = [];
  for (const [path, pkg] of workspaces) {
    const version = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    if (version) {
      found.push([path, version]);
    }
  }
  return found;
}

const problems: string[] = [];

for (const [name, value] of overrides) {
  const alias = /^npm:(?<target>.+)@(?<version>[^@]+)$/u.exec(value)?.groups;
  const target = alias?.target ?? name;
  const version = alias?.version ?? value;

  for (const [path, pin] of pinsOf(target)) {
    if (pin !== version) {
      problems.push(
        `overrides.${name} is "${value}" but ${path} pins ${target} at ${pin}.\n` +
          `  Both copies ship. Set the override to ${alias ? `npm:${target}@${pin}` : pin}, ` +
          `or move ${target} to that version everywhere.`,
      );
    }
  }
}

const lock = readLockfile(resolve(repoRoot, "bun.lock"));
for (const { override, declaredBy } of COMPANION_PINS) {
  const pinned = root.overrides?.[override];
  if (!pinned) {
    continue;
  }
  const entry = lock?.packages?.[declaredBy];
  if (!entry) {
    console.warn(`Skipping ${override}: no bun.lock entry for ${declaredBy}.`);
    continue;
  }
  const declared = lockedDependencies(entry)[override];
  if (declared && declared !== pinned) {
    problems.push(
      `overrides.${override} is "${pinned}" but ${declaredBy} declares ${declared}.\n` +
        `  ${declaredBy} runs against an older core than it pins. Set the override to ${declared}.`,
    );
  }
}

if (problems.length > 0) {
  console.error("Root `overrides` have drifted from the packages they dedupe:\n");
  for (const problem of problems) {
    console.error(`  ${problem}\n`);
  }
  console.error("Rationale for each override is in the `//overrides` block in package.json.");
  process.exit(1);
}

console.log(`Override pins OK (${overrides.length} checked).`);
