import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useMutationWithInvalidation } from "./use-mutation-with-invalidation";

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  return { client, invalidateSpy };
}

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useMutationWithInvalidation", () => {
  it("invalidates a static list of keys on success", async () => {
    const { client, invalidateSpy } = makeClient();

    const { result } = renderHook(
      () =>
        useMutationWithInvalidation({
          mutationFn: async () => "done",
          invalidates: [["a"], ["b", "c"]],
        }),
      { wrapper: wrap(client) },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["a"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["b", "c"] });
  });

  it("derives keys from the mutation variables when `invalidates` is a function", async () => {
    const { client, invalidateSpy } = makeClient();

    const { result } = renderHook(
      () =>
        useMutationWithInvalidation<string, { id: string }>({
          mutationFn: async ({ id }) => `ok:${id}`,
          invalidates: (variables) => [["item", variables.id]],
        }),
      { wrapper: wrap(client) },
    );

    await act(async () => {
      await result.current.mutateAsync({ id: "xyz" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["item", "xyz"] });
  });

  it("passes the mutation response to the `invalidates` function", async () => {
    const { client, invalidateSpy } = makeClient();

    const { result } = renderHook(
      () =>
        useMutationWithInvalidation<{ slug: string }, void>({
          mutationFn: async () => ({ slug: "from-server" }),
          invalidates: (_variables, data) => [["item", data.slug]],
        }),
      { wrapper: wrap(client) },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["item", "from-server"] });
  });

  it("does not invalidate when the mutation fails", async () => {
    const { client, invalidateSpy } = makeClient();

    const { result } = renderHook(
      () =>
        useMutationWithInvalidation({
          mutationFn: async () => {
            throw new Error("nope");
          },
          invalidates: [["a"]],
        }),
      { wrapper: wrap(client) },
    );

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("nope");
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
