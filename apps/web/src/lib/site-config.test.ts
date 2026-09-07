import { afterEach, describe, expect, it, vi } from "vitest";

import { getIsPreview, getSiteUrl } from "./site-config";

function setRobots(content: string) {
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = content;
  document.head.append(meta);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  document.head.querySelectorAll('meta[name="robots"]').forEach((meta) => meta.remove());
});

describe("getSiteUrl", () => {
  it("returns the current origin in the browser, ignoring SITE_URL", () => {
    vi.stubEnv("SITE_URL", "https://openrift.app");

    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("returns SITE_URL on the server", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("SITE_URL", "https://openrift.app");

    expect(getSiteUrl()).toBe("https://openrift.app");
  });

  it("falls back to the dev server origin when SITE_URL is unset", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("SITE_URL", undefined);

    expect(getSiteUrl()).toBe("http://localhost:5173");
  });
});

describe("getIsPreview", () => {
  it("is true in the browser when the robots meta asks for noindex", () => {
    setRobots("noindex, nofollow");

    expect(getIsPreview()).toBe(true);
  });

  it("is false in the browser when the robots meta allows indexing", () => {
    setRobots("index, follow");

    expect(getIsPreview()).toBe(false);
  });

  it("is false in the browser when there is no robots meta", () => {
    expect(getIsPreview()).toBe(false);
  });

  it("reads APP_ENV on the server", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("APP_ENV", "preview");

    expect(getIsPreview()).toBe(true);
  });

  it("is false on the server for any other APP_ENV", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("APP_ENV", "production");

    expect(getIsPreview()).toBe(false);
  });
});
