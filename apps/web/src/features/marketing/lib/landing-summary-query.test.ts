import type { LandingSummaryResponse } from "@openrift/shared/types/api/catalog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Importing the module evaluates createServerFn(...).handler(...) at the top
// level, so this stub is needed just to import it.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      validator: () => chain,
    };
    return chain;
  },
}));

const { landingSummaryQueryOptions } = await import("./landing-summary-query");

const SUMMARY: LandingSummaryResponse = {
  cardCount: 312,
  printingCount: 468,
  copyCount: 142,
  thumbnailIds: ["019d02f1-d14f-769f-9295-9852db692dbe"],
  thumbnails: [
    {
      imageId: "019d02f1-d14f-769f-9295-9852db692dbe",
      rarity: "epic",
      domains: ["fury"],
      name: "Jinx, Rebel",
      shortCode: "OGN-202",
      variantLabel: null,
      priceCents: 420,
    },
  ],
  legendThumbnailIds: ["019d02f1-d14f-769f-9295-9852db692dbf"],
  promoSections: [
    {
      path: ["Nexus Night", "Spiritforged"],
      printingCount: 40,
      printings: [
        {
          imageId: "019d02f1-d14f-769f-9295-9852db692dbe",
          name: "Navori Scout",
          shortCode: "SFD-037",
          rarity: "common",
          markers: ["Promo"],
        },
      ],
    },
  ],
};

// fetch may be called with a Request object or a (url, init) pair; normalize both.
function fetchedUrl(call: unknown[]): string {
  const first = call[0];
  return first instanceof Request ? first.url : String(first);
}

const originalLocation = globalThis.location;

beforeEach(() => {
  // Page origin differs from the server API base's localhost:3000 dev
  // fallback; under plain jsdom the two collide and hide same-origin bugs.
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { ...originalLocation, origin: "https://preview.openrift.app" },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.unstubAllGlobals();
});

describe("landingSummaryQueryOptions browser fetch", () => {
  it("fetches the summary same-origin, never the internal localhost base", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(SUMMARY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await landingSummaryQueryOptions.queryFn?.({} as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchedUrl(fetchMock.mock.calls[0]!);
    expect(url).toBe("https://preview.openrift.app/api/v1/landing-summary");
    expect(url).not.toContain("localhost:3000");
    expect(result).toEqual(SUMMARY);
  });
});
