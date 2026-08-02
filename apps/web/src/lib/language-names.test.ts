import { describe, expect, it } from "vitest";

import { languageCodeFromSource, languageNameForCode } from "./language-names";

describe("languageNameForCode", () => {
  it("writes the full name for the codes other tools spell out", () => {
    expect(languageNameForCode("EN")).toBe("English");
    expect(languageNameForCode("FR")).toBe("French");
    expect(languageNameForCode("SC")).toBe("Chinese (Simplified)");
  });

  it("writes the bare code for a language with no full name", () => {
    expect(languageNameForCode("KR")).toBe("KR");
  });
});

describe("languageCodeFromSource", () => {
  it("reads the full names back", () => {
    expect(languageCodeFromSource("English")).toBe("EN");
    expect(languageCodeFromSource("french")).toBe("FR");
    expect(languageCodeFromSource("Français")).toBe("FR");
    expect(languageCodeFromSource("Chinese (Simplified)")).toBe("SC");
    expect(languageCodeFromSource("Chinese")).toBe("SC");
  });

  it("reads bare catalog codes back, in any case", () => {
    expect(languageCodeFromSource("EN")).toBe("EN");
    expect(languageCodeFromSource("sc")).toBe("SC");
    expect(languageCodeFromSource(" fr ")).toBe("FR");
  });

  it("remaps a code retired by a rename", () => {
    expect(languageCodeFromSource("zh")).toBe("SC");
    expect(languageCodeFromSource("ZH")).toBe("SC");
  });

  it("round-trips a language that has no full name", () => {
    expect(languageCodeFromSource(languageNameForCode("KR"))).toBe("KR");
  });

  it("does not fold Traditional Chinese into Simplified", () => {
    expect(languageCodeFromSource("Chinese (Traditional)")).toBeUndefined();
  });

  it("returns undefined for blank and non-language cells", () => {
    expect(languageCodeFromSource(undefined)).toBeUndefined();
    expect(languageCodeFromSource("")).toBeUndefined();
    expect(languageCodeFromSource("   ")).toBeUndefined();
    expect(languageCodeFromSource("SEAL")).toBeUndefined();
    expect(languageCodeFromSource("n/a")).toBeUndefined();
  });
});
