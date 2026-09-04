import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";

import { Route } from "./meta_.players_.$key";

type LoaderContext = ReturnType<typeof makeContext>;
type LoaderFn = (ctx: {
  context: LoaderContext;
  params: { key: string };
  deps: Record<string, unknown>;
}) => Promise<unknown>;

const KEY = "pnrenata";

// Two released main sets, so the era the URL names is a bounded window.
const SETS = {
  sets: [
    {
      slug: "origins",
      name: "Origins",
      setType: "main",
      releases: { en: { releasedAt: "2026-01-01", precision: "day" } },
    },
    {
      slug: "vendetta",
      name: "Vendetta",
      setType: "main",
      releases: { en: { releasedAt: "2026-08-01", precision: "day" } },
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
    return Promise.resolve({ key: KEY, name: "Renata", finishes: [] });
  });
  return { queryClient: { query } };
}

async function warmedKeys(deps: Record<string, unknown> = {}): Promise<readonly unknown[][]> {
  const context = makeContext();
  await (Route.options.loader as unknown as LoaderFn)({ context, params: { key: KEY }, deps });
  return context.queryClient.query.mock.calls.map((call) => [...call[0].queryKey]);
}

describe("/meta/players/$key loader", () => {
  it("keeps the whole archive out of the dehydrated SSR payload", async () => {
    const keys = await warmedKeys();

    expect(keys).not.toContainEqual([...queryKeys.meta.decks()]);
  });

  it("still warms the player the page renders from", async () => {
    const keys = await warmedKeys();

    expect(keys).toContainEqual([...queryKeys.meta.player(KEY)]);
  });

  it("warms this player's own lists under the scope the URL names, facets and all", async () => {
    const keys = await warmedKeys({ era: "origins", countriesEx: ["DE"] });

    expect(keys).toContainEqual([
      ...queryKeys.meta.decks({
        from: "2026-01-01",
        to: "2026-07-31",
        formats: ["constructed"],
        countriesEx: ["DE"],
        player: KEY,
      }),
    ]);
  });

  it("asks for the whole record uncapped, since a player's is a few dozen rows", async () => {
    const keys = await warmedKeys({ era: "all", formats: [] });

    expect(keys).toContainEqual([...queryKeys.meta.decks({ player: KEY })]);
  });
});
