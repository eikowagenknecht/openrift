import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bundleShareImageUrl,
  collectionShareImageUrl,
  deckImageFromCardsUrl,
  deckOwnerImageUrl,
  deckShareImageUrl,
  downloadImageFromPost,
  downloadImageFromUrl,
  listOwnerImageUrl,
  listShareImageUrl,
  shareImageVersion,
  tierListOwnerImageUrl,
  tierListShareImageUrl,
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

describe("listOwnerImageUrl", () => {
  it("builds the owner-authenticated list image URL by list id", () => {
    expect(listOwnerImageUrl("https://openrift.app", "list-1", 42)).toBe(
      "https://openrift.app/api/v1/lists/list-1/image.png?v=42",
    );
  });

  it("appends size=hq for the high-resolution download variant", () => {
    expect(listOwnerImageUrl("https://openrift.app", "list-1", 42, "hq")).toBe(
      "https://openrift.app/api/v1/lists/list-1/image.png?v=42&size=hq",
    );
  });
});

describe("deckShareImageUrl", () => {
  it("builds an absolute /api/v1 deck image URL with the version param", () => {
    expect(deckShareImageUrl("https://openrift.app", "tok123", 42)).toBe(
      "https://openrift.app/api/v1/decks/share/tok123/image.png?v=42",
    );
  });

  it("appends size=hq for the high-resolution download variant", () => {
    expect(deckShareImageUrl("https://openrift.app", "tok123", 42, "hq")).toBe(
      "https://openrift.app/api/v1/decks/share/tok123/image.png?v=42&size=hq",
    );
  });
});

describe("deckOwnerImageUrl", () => {
  it("builds the owner-authenticated deck image URL by deck id", () => {
    expect(deckOwnerImageUrl("https://openrift.app", "deck-1")).toBe(
      "https://openrift.app/api/v1/decks/deck-1/image.png",
    );
  });

  it("appends size=hq for the high-resolution download variant", () => {
    expect(deckOwnerImageUrl("https://openrift.app", "deck-1", "hq")).toBe(
      "https://openrift.app/api/v1/decks/deck-1/image.png?size=hq",
    );
  });

  it("appends aspect=vertical for the 9:16 export", () => {
    expect(deckOwnerImageUrl("https://openrift.app", "deck-1", undefined, "vertical")).toBe(
      "https://openrift.app/api/v1/decks/deck-1/image.png?aspect=vertical",
    );
  });

  it("omits the aspect for the default canvas", () => {
    expect(deckOwnerImageUrl("https://openrift.app", "deck-1", undefined, "landscape")).toBe(
      "https://openrift.app/api/v1/decks/deck-1/image.png",
    );
  });

  it("carries both parameters when both are asked for", () => {
    expect(deckOwnerImageUrl("https://openrift.app", "deck-1", "hq", "vertical")).toBe(
      "https://openrift.app/api/v1/decks/deck-1/image.png?size=hq&aspect=vertical",
    );
  });
});

describe("tierListShareImageUrl", () => {
  it("builds an absolute /api/v1 tier list image URL with the version param", () => {
    expect(tierListShareImageUrl("https://openrift.app", "tok123", 42)).toBe(
      "https://openrift.app/api/v1/tier-lists/share/tok123/image.png?v=42",
    );
  });

  it("appends size=hq for the high-resolution download variant", () => {
    expect(tierListShareImageUrl("https://openrift.app", "tok123", 42, "hq")).toBe(
      "https://openrift.app/api/v1/tier-lists/share/tok123/image.png?v=42&size=hq",
    );
  });
});

describe("tierListOwnerImageUrl", () => {
  it("builds the owner-authenticated tier list image URL by id", () => {
    expect(tierListOwnerImageUrl("https://openrift.app", "tl-1")).toBe(
      "https://openrift.app/api/v1/tier-lists/tl-1/image.png",
    );
  });

  it("appends size=hq for the high-resolution download variant", () => {
    expect(tierListOwnerImageUrl("https://openrift.app", "tl-1", "hq")).toBe(
      "https://openrift.app/api/v1/tier-lists/tl-1/image.png?size=hq",
    );
  });

  it("appends aspect=vertical for the 9:16 export", () => {
    expect(tierListOwnerImageUrl("https://openrift.app", "tl-1", undefined, "vertical")).toBe(
      "https://openrift.app/api/v1/tier-lists/tl-1/image.png?aspect=vertical",
    );
  });
});

describe("deckImageFromCardsUrl", () => {
  it("builds the public from-cards render endpoint URL", () => {
    expect(deckImageFromCardsUrl("https://openrift.app")).toBe(
      "https://openrift.app/api/v1/decks/image",
    );
  });

  it("appends size=hq for the high-resolution download variant", () => {
    expect(deckImageFromCardsUrl("https://openrift.app", "hq")).toBe(
      "https://openrift.app/api/v1/decks/image?size=hq",
    );
  });

  it("appends aspect=vertical for the 9:16 export", () => {
    expect(deckImageFromCardsUrl("https://openrift.app", undefined, "vertical")).toBe(
      "https://openrift.app/api/v1/decks/image?aspect=vertical",
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

describe("collectionShareImageUrl", () => {
  it("builds an absolute /api/v1 collection image URL with the version param", () => {
    expect(collectionShareImageUrl("https://openrift.app", "tok123", 42)).toBe(
      "https://openrift.app/api/v1/collections/share/tok123/image.png?v=42",
    );
  });

  it("accepts a composite updatedAt-copyCount version (so adds/removes bust the cache)", () => {
    expect(collectionShareImageUrl("https://openrift.app", "tok123", "1700-12")).toBe(
      "https://openrift.app/api/v1/collections/share/tok123/image.png?v=1700-12",
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

describe("downloadImageFromPost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("POSTs the JSON body and downloads the returned image", async () => {
    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    URL.createObjectURL = vi.fn(() => "blob:fake") as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["x"])) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await downloadImageFromPost(
      "https://example.test/decks/image",
      { deckName: "Azir", cards: [] },
      "azir.png",
    );

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/decks/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckName: "Azir", cards: [] }),
    });
    expect(anchor.download).toBe("azir.png");
    expect(click).toHaveBeenCalledOnce();
  });

  it("throws when the render response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 400 })),
    );
    await expect(
      downloadImageFromPost("https://example.test/decks/image", {}, "x.png"),
    ).rejects.toThrow(/400/u);
  });
});
