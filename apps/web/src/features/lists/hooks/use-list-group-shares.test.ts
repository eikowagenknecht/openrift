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
  // module evaluates without dragging in real request plumbing.
  createMiddleware: () => ({ server: () => ({}) }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "user-1",
  useUserId: () => "user-1",
}));

const { listGroupSharesQueryOptions } = await import("./use-list-group-shares");

describe("listGroupSharesQueryOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws Error('NOT_FOUND') when the group-shares API returns 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { defined: true, code: "NOT_FOUND", status: 404, message: "List not found" },
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = listGroupSharesQueryOptions("user-1", "does-not-exist");
    expect(queryFn).toBeDefined();
    await expect((queryFn as () => Promise<unknown>)()).rejects.toThrow(/^NOT_FOUND$/u);

    // oRPC's fetch link may call fetch(url, init) or fetch(request); read the URL
    // from whichever shape so the assertion isn't coupled to the convention.
    const [first] = fetchMock.mock.calls[0] as [string | Request];
    const calledUrl = first instanceof Request ? first.url : String(first);
    expect(calledUrl).toBe("http://localhost:3000/api/v1/lists/does-not-exist/group-shares");
  });

  it("rethrows non-404 errors untouched", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { defined: false, code: "INTERNAL_SERVER_ERROR", status: 500, message: "boom" },
          { status: 500 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = listGroupSharesQueryOptions("user-1", "list-1");
    await expect((queryFn as () => Promise<unknown>)()).rejects.toThrow("boom");
  });

  it("returns the parsed payload on 200", async () => {
    const payload = { items: [{ groupId: "g1", name: "Group One", slug: "group-one" }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = listGroupSharesQueryOptions("user-1", "list-1");
    const result = await (queryFn as () => Promise<unknown>)();
    expect(result).toEqual(payload);
  });
});
