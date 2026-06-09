import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bundleShareImageUrl,
  downloadImageFromUrl,
  listShareImageUrl,
  shareImageVersion,
} from "./share-image";

describe("shareImageVersion", () => {
  it("returns epoch milliseconds for a valid ISO timestamp", () => {
    expect(shareImageVersion("2026-06-09T00:00:00.000Z")).toBe(Date.UTC(2026, 5, 9));
  });

  it("returns 0 for an undefined timestamp", () => {
    expect(shareImageVersion(undefined)).toBe(0);
  });

  it("returns 0 for an unparseable timestamp", () => {
    expect(shareImageVersion("not-a-date")).toBe(0);
  });

  it("changes when the timestamp changes (so the cache key busts)", () => {
    const earlier = shareImageVersion("2026-06-09T00:00:00.000Z");
    const later = shareImageVersion("2026-06-09T00:00:01.000Z");
    expect(later).toBeGreaterThan(earlier);
  });
});

describe("listShareImageUrl", () => {
  it("builds an absolute /api/v1 list image URL with the version param", () => {
    expect(listShareImageUrl("https://openrift.app", "tok123", 42)).toBe(
      "https://openrift.app/api/v1/lists/share/tok123/image.png?v=42",
    );
  });
});

describe("bundleShareImageUrl", () => {
  it("builds an absolute /api/v1 bundle image URL with the version param", () => {
    expect(bundleShareImageUrl("https://openrift.app", "tok123", 42)).toBe(
      "https://openrift.app/api/v1/users/share/tok123/image.png?v=42",
    );
  });

  it("accepts a composite string version (epoch-count) for membership-aware busting", () => {
    expect(bundleShareImageUrl("https://openrift.app", "tok123", "1700-3")).toBe(
      "https://openrift.app/api/v1/users/share/tok123/image.png?v=1700-3",
    );
  });
});

describe("downloadImageFromUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fetches the image and clicks an anchor with the given filename", async () => {
    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:fake") as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["x"])) })),
    );

    await downloadImageFromUrl("https://example.test/img.png", "my-list.png");

    expect(anchor.download).toBe("my-list.png");
    expect(anchor.href).toBe("blob:fake");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("throws when the image response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    );
    await expect(downloadImageFromUrl("https://example.test/img.png", "x.png")).rejects.toThrow(
      /500/u,
    );
  });
});
