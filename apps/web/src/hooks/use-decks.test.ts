import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler:
        (fn: (args: { context: { cookie: string | undefined }; data: unknown }) => unknown) =>
        (input: { data: unknown }) =>
          fn({ context: { cookie: undefined }, ...input }),
      validator: () => chain,
      middleware: () => chain,
    };
    return chain;
  },
  createMiddleware: () => ({ server: () => ({}) }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
}));

let currentUserId: string | null = "user-1";

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => {
    if (currentUserId === null) {
      throw new Error("useRequiredUserId() called without an authenticated session.");
    }
    return currentUserId;
  },
  useUserId: () => currentUserId,
}));

const { deckDetailQueryOptions, deleteDeckFn, useDeleteDeck } = await import("./use-decks");

describe("deckDetailQueryOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws Error('NOT_FOUND') when the deck API returns 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { defined: true, code: "NOT_FOUND", status: 404, message: "Not Found" },
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = deckDetailQueryOptions("user-1", "does-not-exist");
    expect(queryFn).toBeDefined();
    await expect((queryFn as () => Promise<unknown>)()).rejects.toThrow("NOT_FOUND");

    // oRPC's fetch link may call fetch(url, init) or fetch(request); read the URL
    // from whichever shape so the assertion isn't coupled to the convention.
    const [first] = fetchMock.mock.calls[0] as [string | Request];
    const calledUrl = first instanceof Request ? first.url : String(first);
    expect(calledUrl).toBe("http://localhost:3000/api/v1/decks/does-not-exist");
  });

  it("returns the parsed payload on 200", async () => {
    const payload = { deck: { id: "d1" }, cards: [] };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = deckDetailQueryOptions("user-1", "d1");
    const result = await (queryFn as () => Promise<unknown>)();
    expect(result).toEqual(payload);
  });
});

describe("deleteDeckFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("treats a 404 as success — the deck is already gone", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { defined: true, code: "NOT_FOUND", status: 404, message: "Not Found" },
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteDeckFn({ data: "already-deleted" })).resolves.toBeUndefined();
  });

  it("still throws on other API errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: "Couldn't delete deck" }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteDeckFn({ data: "d1" })).rejects.toThrow();
  });
});

describe("useDeleteDeck", () => {
  afterEach(() => {
    currentUserId = "user-1";
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient();
    return createElement(QueryClientProvider, { client }, children);
  }

  it("mounts without a session", () => {
    currentUserId = null;

    const { result } = renderHook(() => useDeleteDeck(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });

  it("mounts for a signed-in user", () => {
    const { result } = renderHook(() => useDeleteDeck(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });
});
