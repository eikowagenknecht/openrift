import type { PriceLookup, PricesResponse } from "@openrift/shared";
import { priceLookupFromMap } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock createServerFn so the SSR handler chain resolves without a TanStack Start
// server (same as use-cards.test.ts).
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      middleware: () => chain,
      validator: () => chain,
    };
    return chain;
  },
}));

// Mock server-cache with a test-local QueryClient (the real one is a singleton).
vi.mock("@/lib/server-cache", async () => {
  const { QueryClient: QC } = await import("@tanstack/react-query");
  return { serverCache: new QC({ defaultOptions: { queries: { retry: false } } }) };
});

// The synced-prices hook is mocked so each test controls whether the on-device
// path is ready; the real one is exercised end-to-end in
// prices-collection.sync.test.ts.
const mockSyncedPrices = vi.fn<() => PriceLookup | null>();
vi.mock("@/lib/prices-collection", () => ({
  useSyncedPrices: () => mockSyncedPrices(),
}));

const { usePrices, pricesQueryOptions } = await import("./use-prices");

const EDGE_RESPONSE: PricesResponse = {
  prices: {
    "printing-edge": { tcgplayer: 999, cardmarket: 750 },
  },
  currencies: { tcgplayer: "USD", cardmarket: "EUR", cardtrader: "EUR" },
};

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  mockSyncedPrices.mockReset();
});

describe("pricesQueryOptions (fallback edge path)", () => {
  it("selects a PriceLookup converting cents to major units", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(Response.json(EDGE_RESPONSE)),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // fetchQuery returns raw data (no select); apply the select manually.
    const raw = await queryClient.fetchQuery(pricesQueryOptions);
    const lookup = pricesQueryOptions.select!(raw);

    expect(lookup.get("printing-edge", "tcgplayer")).toBe(9.99);
    expect(lookup.get("printing-edge", "cardmarket")).toBe(7.5);
    expect(lookup.has("printing-edge")).toBe(true);
    expect(lookup.has("missing")).toBe(false);
  });
});

describe("usePrices swap", () => {
  it("falls back to the edge query when the synced lookup is not ready", async () => {
    mockSyncedPrices.mockReturnValue(null);
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(Response.json(EDGE_RESPONSE)),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => usePrices(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.has("printing-edge")).toBe(true));
    expect(result.current.get("printing-edge", "tcgplayer")).toBe(9.99);
  });

  it("returns the synced lookup when it is ready, ignoring the edge data", async () => {
    const synced = priceLookupFromMap({ "printing-synced": { cardtrader: 4200 } });
    mockSyncedPrices.mockReturnValue(synced);
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(Response.json(EDGE_RESPONSE)),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => usePrices(), { wrapper: wrapper(queryClient) });

    // The suspense query is always subscribed, but the synced lookup wins.
    await waitFor(() => expect(result.current).toBe(synced));
    expect(result.current.get("printing-synced", "cardtrader")).toBe(42);
    expect(result.current.has("printing-edge")).toBe(false);
  });
});
