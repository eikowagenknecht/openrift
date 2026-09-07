import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      validator: () => chain,
      middleware: () => chain,
    };
    return chain;
  },
  createMiddleware: () => ({ server: (fn: (...args: unknown[]) => unknown) => fn }),
}));

const { adminCardDetailQueryOptions, hasPendingRehost } = await import("./use-admin-card-queries");

function image(overrides: { originalUrl?: string | null; rehostedUrl?: string | null } = {}) {
  return { originalUrl: "https://example.com/a.png", rehostedUrl: null, ...overrides };
}

describe("hasPendingRehost", () => {
  it("returns false when the data is undefined", () => {
    expect(hasPendingRehost(undefined)).toBe(false);
  });

  it("returns false when there are no printing images", () => {
    expect(hasPendingRehost({})).toBe(false);
    expect(hasPendingRehost({ printingImages: [] })).toBe(false);
  });

  it("returns true when an image has a source URL but no rehosted URL", () => {
    expect(hasPendingRehost({ printingImages: [image()] })).toBe(true);
  });

  it("returns false once every image is rehosted", () => {
    expect(
      hasPendingRehost({
        printingImages: [image({ rehostedUrl: "/media/cards/aa/img-1" })],
      }),
    ).toBe(false);
  });

  it("ignores images that can never be rehosted (no source URL)", () => {
    expect(
      hasPendingRehost({ printingImages: [image({ originalUrl: null, rehostedUrl: null })] }),
    ).toBe(false);
  });

  it("returns true when any image is still pending in a mixed set", () => {
    expect(
      hasPendingRehost({
        printingImages: [image({ rehostedUrl: "/media/cards/aa/done" }), image()],
      }),
    ).toBe(true);
  });
});

describe("adminCardDetailQueryOptions", () => {
  it("encodes the card slug into the query key", () => {
    expect(adminCardDetailQueryOptions("dawnbringer").queryKey).toEqual([
      "admin",
      "cards",
      "detail",
      "dawnbringer",
    ]);
  });

  it("polls while a rehost is pending and stops once it completes", () => {
    const refetchInterval = adminCardDetailQueryOptions("dawnbringer").refetchInterval as (query: {
      state: {
        data?: { printingImages?: { originalUrl: string | null; rehostedUrl: string | null }[] };
      };
    }) => number | false;

    expect(refetchInterval({ state: { data: { printingImages: [image()] } } })).toBe(3000);
    expect(
      refetchInterval({
        state: { data: { printingImages: [image({ rehostedUrl: "/media/cards/aa/x" })] } },
      }),
    ).toBe(false);
    expect(refetchInterval({ state: { data: undefined } })).toBe(false);
  });
});
