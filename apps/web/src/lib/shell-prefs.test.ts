import { beforeEach, describe, expect, it } from "vitest";

import { readClientCookie, resolvePaletteFromCookie, resolveThemeFromCookie } from "./shell-prefs";

function clearCookies() {
  for (const row of document.cookie.split("; ")) {
    const name = row.split("=")[0];
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
}

describe("resolveThemeFromCookie", () => {
  it("resolves a dark preference to dark", () => {
    expect(resolveThemeFromCookie(JSON.stringify({ state: { preference: "dark" } }))).toBe("dark");
  });

  it("resolves a light preference to light", () => {
    expect(resolveThemeFromCookie(JSON.stringify({ state: { preference: "light" } }))).toBe(
      "light",
    );
  });

  it("resolves auto to light (matchMedia is corrected client-side by THEME_SCRIPT)", () => {
    expect(resolveThemeFromCookie(JSON.stringify({ state: { preference: "auto" } }))).toBe("light");
  });

  it("defaults to light when the cookie is missing", () => {
    expect(resolveThemeFromCookie(null)).toBe("light");
    expect(resolveThemeFromCookie(undefined)).toBe("light");
    expect(resolveThemeFromCookie("")).toBe("light");
  });

  it("defaults to light on malformed JSON", () => {
    expect(resolveThemeFromCookie("{not json")).toBe("light");
  });

  it("defaults to light when the envelope has no preference", () => {
    expect(resolveThemeFromCookie(JSON.stringify({ state: {} }))).toBe("light");
    expect(resolveThemeFromCookie(JSON.stringify({}))).toBe("light");
  });
});

describe("resolvePaletteFromCookie", () => {
  it("returns a known palette", () => {
    expect(resolvePaletteFromCookie(JSON.stringify({ state: { preference: "default" } }))).toBe(
      "default",
    );
  });

  it("clamps unknown palettes to default", () => {
    expect(
      resolvePaletteFromCookie(JSON.stringify({ state: { preference: "not-a-palette" } })),
    ).toBe("default");
  });

  it("clamps non-string preferences to default", () => {
    expect(resolvePaletteFromCookie(JSON.stringify({ state: { preference: 42 } }))).toBe("default");
  });

  it("defaults when the cookie is missing or malformed", () => {
    expect(resolvePaletteFromCookie(null)).toBe("default");
    expect(resolvePaletteFromCookie(undefined)).toBe("default");
    expect(resolvePaletteFromCookie("{not json")).toBe("default");
  });
});

describe("readClientCookie", () => {
  beforeEach(() => {
    clearCookies();
  });

  it("reads a cookie set in the same format cookie-storage writes", () => {
    const value = JSON.stringify({ state: { preference: "dark" } });
    document.cookie = `theme=${encodeURIComponent(value)}; path=/`;
    expect(readClientCookie("theme")).toBe(value);
  });

  it("returns null for a missing cookie", () => {
    expect(readClientCookie("theme")).toBeNull();
  });

  it("does not match cookies whose name only shares a prefix", () => {
    document.cookie = `theme-extra=${encodeURIComponent("x")}; path=/`;
    expect(readClientCookie("theme")).toBeNull();
  });

  it("preserves '=' characters inside the value", () => {
    document.cookie = `token=${encodeURIComponent("a=b=c")}; path=/`;
    expect(readClientCookie("token")).toBe("a=b=c");
  });

  it("round-trips with the theme resolver", () => {
    const value = JSON.stringify({ state: { preference: "dark" } });
    document.cookie = `theme=${encodeURIComponent(value)}; path=/`;
    expect(resolveThemeFromCookie(readClientCookie("theme"))).toBe("dark");
  });
});
