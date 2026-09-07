import { API_FORMAT_VERSION } from "@openrift/shared/contracts/api-format";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { isBuildIdSafe, versionHeadersMiddleware } from "./version-headers.js";

describe("isBuildIdSafe", () => {
  it("allows responses without a Cache-Control header", () => {
    expect(isBuildIdSafe(null)).toBe(true);
  });

  it("allows no-store responses", () => {
    expect(isBuildIdSafe("no-store")).toBe(true);
    expect(isBuildIdSafe("private, no-store")).toBe(true);
  });

  it("rejects publicly cacheable responses", () => {
    expect(isBuildIdSafe("public, max-age=3600, stale-while-revalidate=86400")).toBe(false);
    expect(isBuildIdSafe("public, max-age=60, stale-while-revalidate=300")).toBe(false);
  });

  it("rejects privately cacheable responses (browser cache still replays them)", () => {
    expect(isBuildIdSafe("private, max-age=60, stale-while-revalidate=300")).toBe(false);
  });

  it("rejects no-cache responses (revalidation refreshes the stored headers instead)", () => {
    expect(isBuildIdSafe("private, no-cache")).toBe(false);
  });
});

describe("versionHeadersMiddleware", () => {
  function appWith(cacheControl?: string, buildId = "abc1234"): Hono {
    return new Hono().use("*", versionHeadersMiddleware(buildId)).get("/api/thing", (c) => {
      if (cacheControl !== undefined) {
        c.header("Cache-Control", cacheControl);
      }
      return c.json({ ok: true });
    });
  }

  it("stamps X-Build-Id (and no format) on responses without a Cache-Control header", async () => {
    const res = await appWith().fetch(new Request("http://localhost/api/thing"));
    expect(res.headers.get("X-Build-Id")).toBe("abc1234");
    expect(res.headers.get("X-Api-Format")).toBeNull();
  });

  it("stamps X-Build-Id (and no format) on no-store responses", async () => {
    const res = await appWith("no-store").fetch(new Request("http://localhost/api/thing"));
    expect(res.headers.get("X-Build-Id")).toBe("abc1234");
    expect(res.headers.get("X-Api-Format")).toBeNull();
  });

  it("stamps X-Api-Format (and no build id) on cacheable responses", async () => {
    const res = await appWith("public, max-age=3600, stale-while-revalidate=86400").fetch(
      new Request("http://localhost/api/thing"),
    );
    expect(res.headers.get("X-Build-Id")).toBeNull();
    expect(res.headers.get("X-Api-Format")).toBe(String(API_FORMAT_VERSION));
  });

  it("stamps X-Api-Format on cacheable responses even without a build id (dev)", async () => {
    const res = await appWith("public, max-age=60", "").fetch(
      new Request("http://localhost/api/thing"),
    );
    expect(res.headers.get("X-Build-Id")).toBeNull();
    expect(res.headers.get("X-Api-Format")).toBe(String(API_FORMAT_VERSION));
  });

  it("stamps neither header on live responses without a build id (dev)", async () => {
    const res = await appWith("no-store", "").fetch(new Request("http://localhost/api/thing"));
    expect(res.headers.get("X-Build-Id")).toBeNull();
    expect(res.headers.get("X-Api-Format")).toBeNull();
  });
});
