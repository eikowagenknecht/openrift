// oxlint-disable-next-line import/no-nodejs-modules -- test lists the vendored flag files on disk
import { readdirSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test lists the vendored flag files on disk
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { countryLabel, countryName, flagIconPath } from "./country";
import { FLAG_CODES } from "./flag-codes";

describe("countryName", () => {
  it("names an assigned alpha-2 code", () => {
    expect(countryName("DE")).toBe("Germany");
    expect(countryName("JP")).toBe("Japan");
  });

  it("accepts either case and surrounding space", () => {
    expect(countryName("de")).toBe("Germany");
    expect(countryName(" de ")).toBe("Germany");
  });

  it("returns null for an unassigned code rather than echoing it back", () => {
    expect(countryName("QQ")).toBeNull();
  });

  it("returns null for CLDR's unknown-region code", () => {
    expect(countryName("ZZ")).toBeNull();
  });

  it("returns null for anything that is not two letters", () => {
    expect(countryName("")).toBeNull();
    expect(countryName("D")).toBeNull();
    expect(countryName("DEU")).toBeNull();
    expect(countryName("12")).toBeNull();
    expect(countryName("gb-eng")).toBeNull();
  });

  it("returns null for a missing code", () => {
    expect(countryName(null)).toBeNull();
    expect(countryName(undefined)).toBeNull();
  });
});

describe("flagIconPath", () => {
  it("points at the vendored lowercase file", () => {
    expect(flagIconPath("DE")).toBe("/images/flags/de.webp");
    expect(flagIconPath("jp")).toBe("/images/flags/jp.webp");
  });

  it("has no path for a named region the package ships no flag for", () => {
    expect(flagIconPath("UK")).toBeNull();
    expect(flagIconPath("ZR")).toBeNull();
  });

  it("has no path for a code that is not alpha-2", () => {
    expect(flagIconPath("gb-eng")).toBeNull();
    expect(flagIconPath(null)).toBeNull();
  });
});

describe("countryLabel", () => {
  it("prefers the country name", () => {
    expect(countryLabel("de")).toBe("Germany");
  });

  it("falls back to the upper-cased code when there is no name", () => {
    expect(countryLabel("qq")).toBe("QQ");
  });

  it("has no label without a code", () => {
    expect(countryLabel(null)).toBeNull();
    expect(countryLabel("gb-eng")).toBeNull();
  });
});

describe("FLAG_CODES", () => {
  it("matches what is actually vendored in public/images/flags", () => {
    const vendored = readdirSync(join(import.meta.dirname, "../../public/images/flags"))
      .filter((file) => file.endsWith(".webp"))
      .map((file) => file.slice(0, -5))
      .toSorted();
    expect([...FLAG_CODES].toSorted()).toEqual(vendored);
  });
});
