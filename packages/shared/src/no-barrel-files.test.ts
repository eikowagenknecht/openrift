// oxlint-disable no-nodejs-modules -- this test introspects the source tree, so it must read files from disk
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

const SKIPPED_DIRS = new Set(["node_modules", "dist", ".output", ".nitro", ".turbo"]);

const MOUNTED_AS_ONE_AGGREGATE_ROUTER = "packages/shared/src/contracts/index.ts";

const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;
const REEXPORT =
  /export\s+(?:type\s+)?(?:\*(?:\s+as\s+[A-Za-z_$][\w$]*)?|\{[^}]*\})\s+from\s+["'][^"']+["'];?/gu;

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRS.has(entry.name) ? [] : listSourceFiles(path);
      }
      if (!/\.tsx?$/u.test(entry.name)) {
        return [];
      }
      if (entry.name.includes(".test.") || entry.name.endsWith(".gen.ts")) {
        return [];
      }
      return [path];
    }),
  );
  return files.flat();
}

function isReexportOnly(contents: string): boolean {
  const withoutComments = contents.replace(COMMENT, "");
  const statements = withoutComments.match(REEXPORT);
  if (!statements) {
    return false;
  }
  return withoutComments.replace(REEXPORT, "").trim() === "";
}

async function sourceRoots(): Promise<string[]> {
  const apps = await readdir(join(REPO_ROOT, "apps"), { withFileTypes: true });
  const roots = apps
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(REPO_ROOT, "apps", entry.name, "src"));
  roots.push(join(REPO_ROOT, "packages", "shared", "src"));
  return roots;
}

async function findBarrels(): Promise<string[]> {
  const found: string[] = [];
  for (const root of await sourceRoots()) {
    const files = await listSourceFiles(root);
    for (const file of files) {
      const contents = await readFile(file, "utf-8");
      if (isReexportOnly(contents)) {
        found.push(relative(REPO_ROOT, file).replaceAll("\\", "/"));
      }
    }
  }
  return found.toSorted();
}

describe("barrel files", () => {
  it("exist nowhere outside the aggregate contract router", async () => {
    expect(await findBarrels()).toStrictEqual([MOUNTED_AS_ONE_AGGREGATE_ROUTER]);
  });

  it("recognises the multi-line and single-line re-export forms", () => {
    expect(
      isReexportOnly(`export { a } from "./a.js";\nexport type {\n  B,\n} from "./b.js";\n`),
    ).toBe(true);
    expect(isReexportOnly(`export { a } from "./a.js";\nexport const b = 1;\n`)).toBe(false);
  });
});
