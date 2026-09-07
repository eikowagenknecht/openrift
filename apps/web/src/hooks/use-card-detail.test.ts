import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      validator: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-cache", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { serverCache: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

const { serverCache } = await import("@/lib/server-cache");
const { cardDetailQueryOptions } = await import("./use-card-detail");

describe("cardDetailQueryOptions", () => {
  beforeEach(() => {
    serverCache.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    serverCache.clear();
  });

  it("throws Error('NOT_FOUND') when the API returns 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { defined: true, code: "NOT_FOUND", status: 404, message: "Not Found" },
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = cardDetailQueryOptions("does-not-exist");
    expect(queryFn).toBeDefined();
    await expect(
      // The vitest queryFn signature has a context arg; tests don't need it.
      (queryFn as () => Promise<unknown>)(),
    ).rejects.toThrow("NOT_FOUND");

    // oRPC's fetch link may call fetch(url, init) or fetch(request); read the
    // URL from whichever shape it used.
    const [first] = fetchMock.mock.calls[0] as [string | Request];
    const calledUrl = first instanceof Request ? first.url : String(first);
    expect(calledUrl).toBe("http://localhost:3000/api/v1/cards/does-not-exist");
  });

  it("returns the parsed payload on 200", async () => {
    const payload = { card: { id: "x", slug: "x" }, printings: [], sets: [], prices: {} };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);

    const { queryFn } = cardDetailQueryOptions("x");
    const result = await (queryFn as () => Promise<unknown>)();
    expect(result).toEqual(payload);
  });
});

describe("cardDetailQueryOptions select (enrichCardDetail)", () => {
  const card = { id: "card-1", slug: "ezreal" };
  const printing = (id: string, setId: string, language = "EN") => ({
    id,
    setId,
    cardId: "card-1",
    language,
  });
  const releases = {
    EN: { releasedAt: "2025-01-01", precision: "day" },
    FR: { releasedAt: "2099-01-01", precision: "day" },
  };
  const product = (printingId: string, slug: string, name: string, quantity: number) => ({
    printingId,
    slug,
    name,
    quantity,
  });

  const runSelect = (response: unknown) => {
    const { select } = cardDetailQueryOptions("ezreal");
    expect(select).toBeDefined();
    return (select as (r: unknown) => ReturnType<typeof Object>)(response) as {
      printings: { id: string; setSlug: string; setReleased: boolean }[];
      productsByPrinting: ReadonlyMap<string, { slug: string; quantity: number }[]>;
      related: { slug: string }[];
    };
  };

  it("groups products by printing id", () => {
    const result = runSelect({
      card,
      printings: [printing("p1", "s1"), printing("p2", "s1")],
      sets: [{ id: "s1", slug: "ogn", releases }],
      products: [
        product("p1", "prerift-ezreal", "Pre-Rift Kit", 2),
        product("p2", "prerift-ezreal", "Pre-Rift Kit", 1),
        product("p1", "arcane-box", "Arcane Box Set", 1),
      ],
    });

    expect(result.productsByPrinting.get("p1")).toEqual([
      product("p1", "prerift-ezreal", "Pre-Rift Kit", 2),
      product("p1", "arcane-box", "Arcane Box Set", 1),
    ]);
    expect(result.productsByPrinting.get("p2")).toEqual([
      product("p2", "prerift-ezreal", "Pre-Rift Kit", 1),
    ]);
  });

  it("omits printings that are in no product", () => {
    const result = runSelect({
      card,
      printings: [printing("p1", "s1")],
      sets: [{ id: "s1", slug: "ogn", releases }],
      products: [],
    });

    expect(result.productsByPrinting.get("p1")).toBeUndefined();
    expect(result.productsByPrinting.size).toBe(0);
  });

  it("preserves the API's product order within a printing", () => {
    // The API orders by product name; grouping must not reshuffle.
    const result = runSelect({
      card,
      printings: [printing("p1", "s1")],
      sets: [{ id: "s1", slug: "ogn", releases }],
      products: [
        product("p1", "arcane-box", "Arcane Box Set", 1),
        product("p1", "prerift-ezreal", "Pre-Rift Kit", 2),
        product("p1", "worlds-2025", "Worlds 2025 Bundle", 1),
      ],
    });

    expect(result.productsByPrinting.get("p1")?.map((p) => p.slug)).toEqual([
      "arcane-box",
      "prerift-ezreal",
      "worlds-2025",
    ]);
  });

  it("falls back to an empty setSlug when the printing's set is missing", () => {
    const result = runSelect({
      card,
      printings: [printing("p1", "s1"), printing("p2", "missing-set")],
      sets: [{ id: "s1", slug: "ogn", releases: {} }],
      products: [],
    });

    expect(result.printings[0]).toMatchObject({ setSlug: "ogn", setReleased: false });
    expect(result.printings[1]).toMatchObject({ setSlug: "", setReleased: true });
  });

  it("passes related cards through unchanged", () => {
    const related = [{ slug: "yasuo-windrider" }, { slug: "yasuo-remorseful" }];
    const result = runSelect({
      card,
      printings: [],
      sets: [],
      products: [],
      related,
    });

    expect(result.related).toEqual(related);
  });

  it("resolves setReleased per printing language", () => {
    const result = runSelect({
      card,
      printings: [printing("p1", "s1", "EN"), printing("p2", "s1", "FR")],
      sets: [{ id: "s1", slug: "ogn", releases }],
      products: [],
    });

    expect(result.printings[0]).toMatchObject({ setSlug: "ogn", setReleased: true });
    expect(result.printings[1]).toMatchObject({ setSlug: "ogn", setReleased: false });
  });
});
