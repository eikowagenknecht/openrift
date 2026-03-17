import { describe, expect, it } from "vitest";

import { matchOrigin } from "./cors";

describe("matchOrigin", () => {
  // -- No restriction --

  it("returns origin when allowed is undefined", () => {
    expect(matchOrigin("https://example.com")).toBe("https://example.com");
  });

  it("returns origin when allowed is *", () => {
    expect(matchOrigin("https://example.com", "*")).toBe("https://example.com");
  });

  it("returns origin when allowed is empty string", () => {
    expect(matchOrigin("https://example.com", "")).toBe("https://example.com");
  });

  // -- Exact match --

  it("returns origin for exact match", () => {
    expect(matchOrigin("https://openrift.app", "https://openrift.app")).toBe(
      "https://openrift.app",
    );
  });

  it("returns undefined when origin does not match", () => {
    expect(matchOrigin("https://evil.com", "https://openrift.app")).toBeUndefined();
  });

  // -- Comma-separated --

  it("matches any origin in a comma-separated list", () => {
    const allowed = "https://openrift.app,https://staging.openrift.app";
    expect(matchOrigin("https://staging.openrift.app", allowed)).toBe(
      "https://staging.openrift.app",
    );
  });

  it("trims whitespace around comma-separated origins", () => {
    const allowed = "https://a.com , https://b.com";
    expect(matchOrigin("https://b.com", allowed)).toBe("https://b.com");
  });

  it("returns undefined when no comma-separated origin matches", () => {
    const allowed = "https://a.com,https://b.com";
    expect(matchOrigin("https://c.com", allowed)).toBeUndefined();
  });

  // -- Wildcard subdomains --

  it("matches wildcard subdomain pattern", () => {
    const allowed = "https://*.openrift-web.workers.dev";
    expect(matchOrigin("https://abc123.openrift-web.workers.dev", allowed)).toBe(
      "https://abc123.openrift-web.workers.dev",
    );
  });

  it("wildcard does not match nested subdomains", () => {
    const allowed = "https://*.workers.dev";
    // [^.]+ means single subdomain segment only
    expect(matchOrigin("https://a.b.workers.dev", allowed)).toBeUndefined();
  });

  it("wildcard does not match empty subdomain", () => {
    const allowed = "https://*.workers.dev";
    expect(matchOrigin("https://.workers.dev", allowed)).toBeUndefined();
  });

  it("matches wildcard in a comma-separated list", () => {
    const allowed = "https://openrift.app,https://*.workers.dev";
    expect(matchOrigin("https://preview.workers.dev", allowed)).toBe("https://preview.workers.dev");
  });

  // -- Edge cases --

  it("does not partial-match without wildcard", () => {
    expect(matchOrigin("https://openrift.app.evil.com", "https://openrift.app")).toBeUndefined();
  });
});
