import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      // Inject a default context with an undefined cookie so handlers can
      // destructure `context.cookie` without the test having to thread it.
      handler:
        (fn: (args: { context: { cookie: string | undefined }; data: unknown }) => unknown) =>
        (input: { data: unknown }) =>
          fn({ context: { cookie: undefined }, ...input }),
      inputValidator: () => chain,
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

const fetchApiMock = vi.fn();
vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApi: (...args: unknown[]) => fetchApiMock(...args),
  fetchApiJson: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "user-1",
  useUserId: () => "user-1",
}));

const { deckDetailQueryOptions } = await import("./use-decks");

describe("deckDetailQueryOptions", () => {
  beforeEach(() => {
    fetchApiMock.mockReset();
  });

  it("throws Error('NOT_FOUND') when the deck API returns 404", async () => {
    fetchApiMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const { queryFn } = deckDetailQueryOptions("user-1", "does-not-exist");
    expect(queryFn).toBeDefined();
    await expect((queryFn as () => Promise<unknown>)()).rejects.toThrow("NOT_FOUND");
    expect(fetchApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/decks/does-not-exist",
        acceptStatuses: [404],
      }),
    );
  });

  it("returns the parsed payload on 200", async () => {
    const payload = { deck: { id: "d1" }, cards: [] };
    fetchApiMock.mockResolvedValueOnce(Response.json(payload));
    const { queryFn } = deckDetailQueryOptions("user-1", "d1");
    const result = await (queryFn as () => Promise<unknown>)();
    expect(result).toEqual(payload);
  });
});
