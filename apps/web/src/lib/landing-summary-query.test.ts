import type { LandingSummaryResponse } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Importing the module evaluates `createServerFn(...).handler(...)` at the top
// level — stub it so the import has no real server-function side effects. We
// only exercise the browser path here.
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

// The oRPC OpenAPI link may call fetch with a Request object or a (url, init)
// pair — normalize both (mirrors copies-query.test.ts).
function fetchedUrl(call: unknown[]): string {
  const first = call[0];
  return first instanceof Request ? first.url : String(first);
}

const originalLocation = globalThis.location;

beforeEach(() => {
  // Reproduce the preview/prod situation: the page origin is NOT the
  // localhost:3000 dev fallback that the server-internal API base degrades to
  // in the browser bundle. Under plain jsdom the two collide (both
  // http://localhost:3000), which is exactly why the original bug slipped
  // through — so we force them apart.
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
    const url = fetchedUrl(fetchMock.mock.calls[0]);
    // Regression: the buggy path used the server `apiOrpcClient`, whose base is
    // the internal `http://localhost:3000` fallback — a cross-origin URL the
    // production CSP blocks. The browser path must go same-origin.
    expect(url).toBe("https://preview.openrift.app/api/v1/landing-summary");
    expect(url).not.toContain("localhost:3000");
    expect(result).toEqual(SUMMARY);
  });
});
