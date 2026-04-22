import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: () => async () => ({ printingId: "test-printing-id" }),
      middleware: () => chain,
      inputValidator: () => chain,
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = { server: () => chain };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApi: vi.fn(),
  fetchApiJson: vi.fn(),
}));

vi.mock("@/lib/server-fns/with-cookies", () => ({
  withCookies: () => {},
}));

const { useAcceptPrintingGroup } = await import("./use-admin-card-mutations");

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

describe("useAcceptPrintingGroup", () => {
  it("invalidates the keys passed via `invalidates`, not keys derived from the payload cardId", async () => {
    // Regression: the page loads card data keyed by URL slug ("ahri-alluring"),
    // but the mutation payload carries the internal UUID as `cardId`. Previously
    // the hook hardcoded `queryKeys.admin.cards.detail(cardId)` using that UUID,
    // so the invalidate call targeted the wrong key and the detail query never
    // refetched — the UI only updated on page refresh.
    const { client, invalidateSpy } = makeClient();
    const slugScopedKey = ["admin", "cards", "detail", "ahri-alluring"] as const;

    const { result } = renderHook(() => useAcceptPrintingGroup([slugScopedKey]), {
      wrapper: wrap(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        cardId: "019cfc3b-0388-743b-8b2e-7e64f56850c3",
        printingFields: {} as never,
        candidatePrintingIds: [],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...slugScopedKey] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["admin", "cards", "detail", "019cfc3b-0388-743b-8b2e-7e64f56850c3"],
    });
  });
});
