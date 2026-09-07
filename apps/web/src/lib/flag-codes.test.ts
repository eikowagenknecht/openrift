// oxlint-disable no-nodejs-modules -- this test compares the generated set against the shipped assets, so it must read files from disk
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FLAG_CODES } from "./flag-codes";

const FLAG_DIR = join(import.meta.dirname, "..", "..", "public", "images", "flags");

async function shippedCodes(): Promise<string[]> {
  const files = await readdir(FLAG_DIR);
  return files.map((file) => file.replace(/\.webp$/u, ""));
}

describe("FLAG_CODES", () => {
  it("holds a code for every shipped flag image", async () => {
    const shipped = await shippedCodes();
    const missing = shipped.filter((code) => !FLAG_CODES.has(code));

    expect(missing).toEqual([]);
  });

  it("holds no code without a shipped flag image", async () => {
    const shipped = new Set(await shippedCodes());
    const orphans = [...FLAG_CODES].filter((code) => !shipped.has(code));

    expect(orphans).toEqual([]);
  });

  it("holds lowercase two-letter codes only", () => {
    const malformed = [...FLAG_CODES].filter((code) => !/^[a-z]{2}$/u.test(code));

    expect(malformed).toEqual([]);
  });

  it("does not match an uppercase lookup", () => {
    expect(FLAG_CODES.has("de")).toBe(true);
    expect(FLAG_CODES.has("DE")).toBe(false);
  });
});
