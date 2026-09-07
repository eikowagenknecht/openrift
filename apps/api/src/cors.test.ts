import { describe, expect, it } from "vitest";

import { isLocalDevOrigin, matchOrigin } from "./cors";

describe("matchOrigin", () => {
  it("returns origin when allowed is undefined", () => {
    expect(matchOrigin("https://example.com")).toBe("https://example.com");
  });

  it("returns origin when allowed is *", () => {
    expect(matchOrigin("https://example.com", "*")).toBe("https://example.com");
  });

  it("returns origin when allowed is empty string", () => {
    expect(matchOrigin("https://example.com", "")).toBe("https://example.com");
  });

  it("returns origin for exact match", () => {
    expect(matchOrigin("https://openrift.app", "https://openrift.app")).toBe(
      "https://openrift.app",
    );
  });

  it("returns undefined when origin does not match", () => {
    expect(matchOrigin("https://evil.com", "https://openrift.app")).toBeUndefined();
  });

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

  it("matches wildcard subdomain pattern", () => {
    const allowed = "https://*.openrift-web.workers.dev";
    expect(matchOrigin("https://abc123.openrift-web.workers.dev", allowed)).toBe(
      "https://abc123.openrift-web.workers.dev",
    );
  });

  it("wildcard does not match nested subdomains", () => {
    const allowed = "https://*.workers.dev";
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

  it("does not partial-match without wildcard", () => {
    expect(matchOrigin("https://openrift.app.evil.com", "https://openrift.app")).toBeUndefined();
  });
});

describe("isLocalDevOrigin", () => {
  it("trusts localhost on any port", () => {
    expect(isLocalDevOrigin("http://localhost:5173")).toBe(true);
    expect(isLocalDevOrigin("http://localhost")).toBe(true);
    expect(isLocalDevOrigin("https://localhost:3000")).toBe(true);
  });

  it("trusts loopback addresses", () => {
    expect(isLocalDevOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isLocalDevOrigin("http://[::1]:5173")).toBe(true);
  });

  it("trusts RFC 1918 private-LAN IPv4 addresses", () => {
    expect(isLocalDevOrigin("http://192.168.40.110:5173")).toBe(true);
    expect(isLocalDevOrigin("http://10.0.0.5:5173")).toBe(true);
    expect(isLocalDevOrigin("http://172.16.0.1:5173")).toBe(true);
    expect(isLocalDevOrigin("http://172.31.255.255:5173")).toBe(true);
  });

  it("rejects public addresses and non-private 172 ranges", () => {
    expect(isLocalDevOrigin("https://openrift.app")).toBe(false);
    expect(isLocalDevOrigin("http://172.15.0.1:5173")).toBe(false);
    expect(isLocalDevOrigin("http://172.32.0.1:5173")).toBe(false);
    expect(isLocalDevOrigin("http://8.8.8.8")).toBe(false);
  });

  it("rejects a hostname that merely embeds a private IP", () => {
    expect(isLocalDevOrigin("https://192.168.0.1.evil.com")).toBe(false);
  });

  it("returns false for malformed origins", () => {
    expect(isLocalDevOrigin("not a url")).toBe(false);
    expect(isLocalDevOrigin("")).toBe(false);
  });
});
