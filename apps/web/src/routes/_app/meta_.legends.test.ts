import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";

import { Route } from "./meta_.legends";

type LoaderContext = ReturnType<typeof makeContext>;
type LoaderFn = (ctx: { context: LoaderContext; deps: unknown }) => Promise<unknown>;
type LoaderDepsFn = (ctx: { search: Record<string, unknown> }) => unknown;

const SETS = {
  sets: [
    {
      slug: "origins",
      name: "Origins",
      setType: "main",
      releases: { en: { releasedAt: "2025-10-31", precision: "day" } },
    },
    {
      slug: "proving",
      name: "Proving Grounds",
      setType: "main",
      releases: { en: { releasedAt: "2026-03-06", precision: "day" } },
    },
  ],
};

const ORIGINS_RANGE = { from: "2025-10-31", to: "2026-03-05" };

function makeContext() {
  const query = vi.fn((options: { queryKey: readonly unknown[] }) =>
    Promise.resolve(options.queryKey[0] === "sets" ? SETS : {}),
  );
  return { queryClient: { query } };
}

async function warmedKeys(search: Record<string, unknown>): Promise<readonly unknown[][]> {
  const context = makeContext();
  const deps = (Route.options.loaderDeps as unknown as LoaderDepsFn)({ search });
  await (Route.options.loader as unknown as LoaderFn)({ context, deps });
  return context.queryClient.query.mock.calls.map((call) => [...call[0].queryKey]);
}

describe("/meta/legends loader", () => {
  it("warms only the era the scope names", async () => {
    const keys = await warmedKeys({ era: "origins" });

    expect(keys).toContainEqual([...queryKeys.meta.events(ORIGINS_RANGE)]);
    expect(keys).not.toContainEqual([...queryKeys.meta.events()]);
  });

  it("reruns for a different era but not for the sort column", async () => {
    const deps = Route.options.loaderDeps as unknown as LoaderDepsFn;

    expect(deps({ search: { era: "origins" } })).not.toEqual(deps({ search: { era: "proving" } }));
    expect(deps({ search: { era: "origins", by: "best" } })).toEqual(
      deps({ search: { era: "origins" } }),
    );
  });

  it("warms the whole list once the reader asks for all time", async () => {
    const keys = await warmedKeys({ era: "all" });

    expect(keys).toContainEqual([...queryKeys.meta.events()]);
  });

  it("warms the set list its eras are derived from", async () => {
    const keys = await warmedKeys({ era: "origins" });

    expect(keys).toContainEqual([...queryKeys.sets.all]);
  });
});
