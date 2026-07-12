import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      validator: () => chain,
      middleware: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/middleware", () => ({ withCookies: {} }));

const { resetCollectionsFn } = await import("./use-collections");

// The createServerFn mock unwraps the chain to the raw handler, which takes
// the ({ context }) shape instead of the wrapped client signature.
const callResetFn = () =>
  (resetCollectionsFn as unknown as (args: { context: { cookie?: string } }) => Promise<unknown>)({
    context: {},
  });

describe("resetCollectionsFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the reset summary on 200", async () => {
    const summary = { removedCopies: 3, removedCollections: 1, removedLists: 1 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(summary)));

    await expect(callResetFn()).resolves.toEqual(summary);
  });

  it("rethrows the defined CONFLICT error as a plain Error with the server message", async () => {
    // The 409 guard fires while copies are reserved in trades / out on loans;
    // the dialog shows error.message, so the server text must survive.
    const message = "Some of your cards are reserved in active trades — cancel those trades first.";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ defined: true, code: "CONFLICT", status: 409, message }, { status: 409 }),
        ),
    );

    await expect(callResetFn()).rejects.toThrow(message);
  });

  it("rethrows undefined errors untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ code: "INTERNAL_SERVER_ERROR", status: 500 }, { status: 500 }),
        ),
    );

    await expect(callResetFn()).rejects.toThrow();
  });
});
