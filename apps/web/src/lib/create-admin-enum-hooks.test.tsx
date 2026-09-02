import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

import { createAdminEnumHooks } from "./create-admin-enum-hooks";

const listKey = ["admin", "widgets"] as const;
const initKey = ["init"] as const;
const promosKey = ["promos"] as const;

function makeClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  return { client, invalidateSpy };
}

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>{children}</Suspense>
      </QueryClientProvider>
    );
  };
}

function makeHooks(overrides?: { staleTime?: number; reorderInvalidates?: readonly string[][] }) {
  const list = vi.fn(() => Promise.resolve([{ slug: "foil" }]));
  const create = vi.fn((_vars: { slug: string; label: string }) => Promise.resolve());
  const update = vi.fn((_vars: { slug: string; label?: string }) => Promise.resolve());
  const reorder = vi.fn((_slugs: string[]) => Promise.resolve());
  const remove = vi.fn((_slug: string) => Promise.resolve());

  const hooks = createAdminEnumHooks({
    queryKey: listKey,
    list,
    invalidates: [listKey, initKey],
    create,
    update,
    reorder,
    remove,
    ...overrides,
  });

  return { hooks, list, create, update, reorder, remove };
}

describe("createAdminEnumHooks", () => {
  it("builds query options from the key, list function and staleTime", async () => {
    const { hooks, list } = makeHooks({ staleTime: 1000 });

    expect(hooks.queryOptions.queryKey).toEqual(listKey);
    expect(hooks.queryOptions.staleTime).toBe(1000);

    const { client } = makeClient();
    await expect(client.query({ ...hooks.queryOptions, staleTime: "static" })).resolves.toEqual([
      { slug: "foil" },
    ]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("leaves staleTime unset when the caller omits it", () => {
    const { hooks } = makeHooks();

    expect(hooks.queryOptions.staleTime).toBeUndefined();
  });

  it("suspends on the list query and exposes its data", async () => {
    const { hooks } = makeHooks();
    const { client } = makeClient();

    const { result } = renderHook(() => hooks.useList(), { wrapper: wrap(client) });

    await waitFor(() => expect(result.current?.data).toEqual([{ slug: "foil" }]));
  });

  it("passes mutation variables straight through to create, update and remove", async () => {
    const { hooks, create, update, remove } = makeHooks();
    const { client } = makeClient();
    const wrapper = wrap(client);

    const created = renderHook(() => hooks.useCreate(), { wrapper });
    await act(async () => {
      await created.result.current.mutateAsync({ slug: "foil", label: "Foil" });
    });
    expect(create.mock.calls[0]?.[0]).toEqual({ slug: "foil", label: "Foil" });

    const updated = renderHook(() => hooks.useUpdate(), { wrapper });
    await act(async () => {
      await updated.result.current.mutateAsync({ slug: "foil", label: "Shiny" });
    });
    expect(update.mock.calls[0]?.[0]).toEqual({ slug: "foil", label: "Shiny" });

    const removed = renderHook(() => hooks.useDelete(), { wrapper });
    await act(async () => {
      await removed.result.current.mutateAsync("foil");
    });
    expect(remove.mock.calls[0]?.[0]).toBe("foil");
  });

  it("invalidates every configured key after a mutation succeeds", async () => {
    const { hooks } = makeHooks();
    const { client, invalidateSpy } = makeClient();

    const { result } = renderHook(() => hooks.useCreate(), { wrapper: wrap(client) });
    await act(async () => {
      await result.current.mutateAsync({ slug: "foil", label: "Foil" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...listKey] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...initKey] });
  });

  it("reorder falls back to the shared invalidate keys", async () => {
    const { hooks, reorder } = makeHooks();
    const { client, invalidateSpy } = makeClient();

    const { result } = renderHook(() => hooks.useReorder(), { wrapper: wrap(client) });
    await act(async () => {
      await result.current.mutateAsync(["foil", "matte"]);
    });

    expect(reorder.mock.calls[0]?.[0]).toEqual(["foil", "matte"]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...listKey] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...initKey] });
  });

  it("reorder uses reorderInvalidates when given, replacing the shared keys", async () => {
    const { hooks } = makeHooks({ reorderInvalidates: [[...listKey], [...promosKey]] });
    const { client, invalidateSpy } = makeClient();

    const { result } = renderHook(() => hooks.useReorder(), { wrapper: wrap(client) });
    await act(async () => {
      await result.current.mutateAsync(["foil", "matte"]);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...promosKey] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: [...initKey] });
  });
});
