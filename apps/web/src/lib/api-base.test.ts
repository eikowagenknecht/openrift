import { afterEach, describe, expect, it, vi } from "vitest";

// PREVIEW_HOSTS is derived from ./env at module load time, so a specific host
// list requires mocking ./env and re-importing api-base with a fresh registry.
async function importWithPreviewHosts(hosts: string) {
  vi.doMock("./env", () => ({ PREVIEW_HOSTS: hosts }));
  vi.resetModules();
  return import("./api-base");
}

describe("isPreview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("./env");
    vi.resetModules();
  });

  it("returns false during SSR, even on a matching host", async () => {
    const { isPreview } = await importWithPreviewHosts(".preview.openrift.app");
    vi.stubGlobal("location", { hostname: "app.preview.openrift.app" });
    vi.stubGlobal("window", undefined);

    expect(isPreview()).toBe(false);
  });

  it("returns true when the hostname ends with a configured suffix", async () => {
    const { isPreview } = await importWithPreviewHosts(".preview.openrift.app");
    vi.stubGlobal("location", { hostname: "app.preview.openrift.app" });

    expect(isPreview()).toBe(true);
  });

  it("returns false when the hostname does not end with any configured suffix", async () => {
    const { isPreview } = await importWithPreviewHosts(".preview.openrift.app");
    vi.stubGlobal("location", { hostname: "openrift.app" });

    expect(isPreview()).toBe(false);
  });

  it("matches against any suffix in a comma-separated list", async () => {
    const { isPreview } = await importWithPreviewHosts(
      ".preview.openrift.app,.staging.openrift.app",
    );
    vi.stubGlobal("location", { hostname: "x.staging.openrift.app" });

    expect(isPreview()).toBe(true);
  });

  it("returns false when PREVIEW_HOSTS is empty", async () => {
    const { isPreview } = await importWithPreviewHosts("");
    vi.stubGlobal("location", { hostname: "app.preview.openrift.app" });

    expect(isPreview()).toBe(false);
  });

  it("ignores empty entries from stray commas in the host list", async () => {
    const { isPreview } = await importWithPreviewHosts(",.preview.openrift.app,,");
    vi.stubGlobal("location", { hostname: "app.preview.openrift.app" });

    expect(isPreview()).toBe(true);
  });
});
