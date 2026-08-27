/* oxlint-disable import/no-nodejs-modules -- standalone script */
/**
 * Fail when a root `overrides` pin drifts from the package it is meant to dedupe.
 *
 * Every entry in the root `overrides` block exists to collapse two copies of one
 * package into one. That only works while the override and the version the repo
 * actually depends on stay equal, and nothing else notices when they don't:
 * syncpack groups by package name, so it sees one instance of each and passes,
 * and an npm: alias hides the relationship from Dependabot entirely — it bumps
 * `html2canvas-pro` in apps/web and leaves `overrides.html2canvas` behind.
 *
 * The cost is silent. A mismatched alias ships both copies of html2canvas-pro as
 * separate chunks (243 KB + 246 KB the last time it happened), and a stale pin
 * of `@tanstack/query-core` makes TypeScript treat two identical-but-different-
 * path type copies as distinct, collapsing createCollection generics to
 * Record<string, unknown>. Both were fixed deliberately once and re-broken by a
 * later group bump.
 *
 * Three rules, all derived from package.json — nothing to keep in sync here:
 *
 * 1. An `npm:<target>@<version>` alias must match every workspace pin of <target>.
 * 2. A plain override must match a workspace's direct pin of the same package.
 * 3. A companion package (listed below) must match the version its own dependent
 *    declares, read from the installed tree.
 *
 * Usage: bun scripts/check-override-pins.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");

/**
 * Overrides that exist to line a transitive package up with the version another
 * dependency declares, rather than with a pin the repo writes itself. The
 * expected value is read from the dependent's installed package.json.
 */
const COMPANION_PINS = [
  {
    override: "@tanstack/query-core",
    // react-query pins its core dep to its own exact version, so an override
    // that lags behind silently runs react-query against an older core.
    declaredBy: "@tanstack/react-query",
    resolveFrom: "apps/web",
  },
];

interface PackageJson {
  name?: string;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
}

function readPackageJson(path: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PackageJson;
  } catch {
    return null;
  }
}

const root = readPackageJson(resolve(repoRoot, "package.json"));
if (!root) {
  console.error("Could not read the root package.json.");
  process.exit(1);
}

const overrides = Object.entries(root.overrides ?? {});

/** Every workspace package.json, keyed by its path relative to the repo root. */
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

/**
 * Every direct pin of `name` across the workspaces.
 * @returns One `[workspace path, version]` pair per workspace depending on it.
 */
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

// Rules 1 and 2: an override must equal the direct pin of the package it targets.
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

// Rule 3: a companion override must equal the version its dependent declares.
for (const { override, declaredBy, resolveFrom } of COMPANION_PINS) {
  const pinned = root.overrides?.[override];
  if (!pinned) {
    continue;
  }
  const installedPath = resolve(repoRoot, resolveFrom, "node_modules", declaredBy, "package.json");
  const installed = readPackageJson(installedPath);
  if (!installed) {
    console.warn(`Skipping ${override}: ${declaredBy} is not installed under ${resolveFrom}.`);
    continue;
  }
  const declared = installed.dependencies?.[override];
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
