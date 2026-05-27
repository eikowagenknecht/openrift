// oxlint-disable no-nodejs-modules -- this test introspects the source tree, so it must read files from disk
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP_ROUTES_DIR = join(import.meta.dirname, "_app");

async function listRouteFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listRouteFiles(path);
      }
      return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return files.flat();
}

describe("_app routes use NotFoundFallback (not RouteNotFoundFallback)", () => {
  it("no file under apps/web/src/routes/_app/ references RouteNotFoundFallback", async () => {
    const files = await listRouteFiles(APP_ROUTES_DIR);
    const offenders: string[] = [];
    for (const file of files) {
      const contents = await readFile(file, "utf-8");
      if (contents.includes("RouteNotFoundFallback")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
