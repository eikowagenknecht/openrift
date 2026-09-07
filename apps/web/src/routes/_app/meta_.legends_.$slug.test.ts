import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";

import { Route } from "./meta_.legends_.$slug";

type LoaderContext = ReturnType<typeof makeContext>;
type LoaderFn = (ctx: {
  context: LoaderContext;
  params: { slug: string };
  deps: Record<string, unknown>;
}) => Promise<unknown>;

const SLUG = "kennen-heart-of-the-tempest";
const CARD_ID = "card-kennen";

const SETS = {
  sets: [
    {
      slug: "origins",
      name: "Origins",
      setType: "main",
      releases: { en: { releasedAt: "2026-01-01", precision: "day" } },
    },
  ],
};

function makeContext() {
  const query = vi.fn((options: { queryKey: readonly unknown[] }) => {
    if (options.queryKey[0] === "feature-flags") {
      return Promise.resolve({ meta: true });
    }
    if (options.queryKey[0] === "sets") {
      return Promise.resolve(SETS);
    }
    return Promise.resolve({ legend: { cardId: CARD_ID }, counts: {}, best: [], finishes: [] });
  });
  return { queryClient: { query } };
}

async function warmedKeys(deps: Record<string, unknown> = {}): Promise<readonly unknown[][]> {
  const context = makeContext();
  await (Route.options.loader as unknown as LoaderFn)({ context, params: { slug: SLUG }, deps });
  return context.queryClient.query.mock.calls.map((call) => [...call[0].queryKey]);
}

describe("/meta/legends/$slug loader", () => {
  it("keeps the whole archive out of the dehydrated SSR payload", async () => {
    const keys = await warmedKeys();

    expect(keys).not.toContainEqual([...queryKeys.meta.decks()]);
  });

  it("warms the legend under the scope in the URL", async () => {
    const keys = await warmedKeys({ era: "origins", tiers: ["premier"] });

    expect(keys).toContainEqual([
      ...queryKeys.meta.legend(SLUG, {
        from: "2026-01-01",
        formats: ["constructed"],
        tiers: ["premier"],
      }),
    ]);
  });

  it("warms one grid's worth of the legend's own lists under the same scope", async () => {
    const keys = await warmedKeys({ era: "origins", tiers: ["premier"] });

    expect(keys).toContainEqual([
      ...queryKeys.meta.decks({
        from: "2026-01-01",
        formats: ["constructed"],
        tiers: ["premier"],
        legend: CARD_ID,
        limit: 8,
      }),
    ]);
  });

  it("reads the legend before the decks, since the card id comes off it", async () => {
    const context = makeContext();
    await (Route.options.loader as unknown as LoaderFn)({
      context,
      params: { slug: SLUG },
      deps: {},
    });
    const reads = context.queryClient.query.mock.calls.map((call) => call[0].queryKey[1]);

    expect(reads.indexOf("legends")).toBeLessThan(reads.indexOf("decks"));
  });
});
