import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";

import { Route } from "./meta_.decks";

type LoaderContext = ReturnType<typeof makeContext>;
type LoaderFn = (ctx: { context: LoaderContext }) => Promise<unknown>;

function makeContext() {
  const query = vi.fn((_options: { queryKey: readonly unknown[] }) => Promise.resolve({}));
  return { queryClient: { query } };
}

async function warmedKeys(): Promise<readonly unknown[][]> {
  const context = makeContext();
  await (Route.options.loader as unknown as LoaderFn)({ context });
  return context.queryClient.query.mock.calls.map((call) => [...call[0].queryKey]);
}

describe("/meta/decks loader", () => {
  it("keeps the archive out of the dehydrated SSR payload", async () => {
    const keys = await warmedKeys();

    expect(keys).not.toContainEqual([...queryKeys.meta.decks()]);
  });

  it("keeps the event list out of the dehydrated SSR payload", async () => {
    const keys = await warmedKeys();

    expect(keys).not.toContainEqual([...queryKeys.meta.events()]);
  });

  it("still warms the shared init query", async () => {
    const keys = await warmedKeys();

    expect(keys).toContainEqual([...queryKeys.init.all]);
  });
});
