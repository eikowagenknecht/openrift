// oxlint-disable-next-line import/no-nodejs-modules -- test reads the seed fixture from disk
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Hosts that are allowed to appear in the checked-in seed fixture. Everything
 * here is synthetic; the fixture must never reference a real host.
 * generate-seed.ts replaces every original_url with an images.example.com
 * placeholder; this test keeps regenerated fixtures honest.
 */
const ALLOWED_HOSTS = new Set(["example.com", "images.example.com"]);

describe("seed fixture", () => {
  it("references no foreign hosts", () => {
    const seedSql = readFileSync(new URL("seed.sql", import.meta.url), "utf-8");
    const urls = seedSql.match(/https?:\/\/[^\s'"]+/gu) ?? [];
    const hosts = new Set(urls.map((url) => new URL(url).hostname));
    const foreignHosts = [...hosts].filter((hostname) => !ALLOWED_HOSTS.has(hostname));
    expect(foreignHosts).toEqual([]);
  });

  it("references no foreign hosts in constants", () => {
    const constants = readFileSync(new URL("constants.ts", import.meta.url), "utf-8");
    const urls = constants.match(/https?:\/\/[^\s'"`]+/gu) ?? [];
    const hosts = new Set(urls.map((url) => new URL(url).hostname));
    const foreignHosts = [...hosts].filter((hostname) => !ALLOWED_HOSTS.has(hostname));
    expect(foreignHosts).toEqual([]);
  });
});
