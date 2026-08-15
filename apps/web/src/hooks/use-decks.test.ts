import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      // Inject a default context with an undefined cookie so handlers can
      // destructure `context.cookie` without the test having to thread it.
      handler:
        (fn: (args: { context: { cookie: string | undefined }; data: unknown }) => unknown) =>
        (input: { data: unknown }) =>
          fn({ context: { cookie: undefined }, ...input }),
      validator: () => chain,
      middleware: () => chain,
    };
    return chain;
  },
  // withCookies middleware imports this at module load; stub it out so the
  // use-decks module evaluates without dragging in real request plumbing.
  createMiddleware: () => ({ server: () => ({}) }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
}));

// Swapped per test: the deck page hosts browser-local decks logged out, so the
// hooks it mounts have to survive a null user.
let currentUserId: string | null = "user-1";

vi.mock("@/lib/auth-session", () => ({
  // Throws on a null user, like the real one, so a hook that reaches for the
  // required id where it shouldn't fails the test instead of passing quietly.
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
    // The server sends a typed (defined) NOT_FOUND error body; the client
    // narrows it with isDefinedError and the handler maps it to the sentinel.
    // Mock global fetch — the boundary the oRPC OpenAPI link calls.
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
    // Regression: a second delete of the same deck (double-click on the
    // confirm, second tab) used to throw ApiError "Not found" and surface an
    // error toast for an outcome the user asked for. The server sends a typed
    // (defined) NOT_FOUND that isDefinedError narrows and the handler swallows.
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
    // Only a 404 is swallowed; any other status propagates. The oRPC client
    // surfaces a 500 as an ORPCError (not code NOT_FOUND), which the handler
    // rethrows.
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

  /** @returns A provider wrapper carrying a fresh QueryClient. */
  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient();
    return createElement(QueryClientProvider, { client }, children);
  }

  it("mounts without a session", () => {
    // The deck page mounts this for local decks too (ADR-035), which a logged
    // out visitor can open. Reading a required userId here threw on mount and
    // took the whole page down with it.
    currentUserId = null;

    const { result } = renderHook(() => useDeleteDeck(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });

  it("mounts for a signed-in user", () => {
    const { result } = renderHook(() => useDeleteDeck(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });
});
