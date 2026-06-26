import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMarketplaceInfo } from "./use-marketplace-info";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { Wrapper, client };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMarketplaceInfo", () => {
  it("skips the request when the printings list is empty", () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMarketplaceInfo([]), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests printings as a deduped, sorted comma list", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(Response.json({ infos: {} }, { status: 200 }));
    const { Wrapper } = makeWrapper();
    renderHook(() => useMarketplaceInfo(["b", "a", "a"]), { wrapper: Wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // The browser oRPC link calls fetch with a Request object (not a URL
    // string); the deduped, sorted printings land as a comma list on the
    // `printings` query param.
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    const requestUrl = new URL(request.url);
    expect(requestUrl.pathname).toBe("/api/v1/prices/marketplace-info");
    expect(requestUrl.searchParams.get("printings")).toBe("a,b");
  });

  it("throws when the server returns a non-ok status", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "boom", code: "INTERNAL_ERROR" }, { status: 500 }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMarketplaceInfo(["a"]), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
