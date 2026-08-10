import type { Marketplace } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDisplayStore } from "@/stores/display-store";
import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

vi.mock("@/hooks/use-price-history", () => ({
  usePriceHistory: () => ({ data: undefined }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardFooter } from "./card-footer";

function makeWrapper(prices: Record<string, Partial<Record<Marketplace, number>>>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["prices"], { prices });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>{children}</Suspense>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

describe("CardFooter chart lazy boundary", () => {
  let resetDisplay: () => void;
  beforeEach(() => {
    resetDisplay = createStoreResetter(useDisplayStore);
  });
  afterEach(() => resetDisplay());

  it("does not render the chart or its fallback when no price is available", () => {
    const printing = stubPrinting();
    render(<CardFooter printing={printing} />, { wrapper: makeWrapper({}) });
    expect(screen.queryByTestId("price-chart-skeleton")).toBeNull();
  });

  it("renders the Suspense fallback then resolves the lazy chart when a price exists", async () => {
    const printing = stubPrinting();
    render(<CardFooter printing={printing} />, {
      wrapper: makeWrapper({ [printing.id]: { cardtrader: 4.5 } }),
    });
    const skeleton = await screen.findByTestId("price-chart-skeleton");
    // The chart is React.lazy; under the full suite's parallel load the
    // chunk import can take longer than the 1000ms default, so allow more time.
    await waitForElementToBeRemoved(skeleton, { timeout: 5000 });
  });

  // The chart is what the price means, the chips are where to act on it.
  it("puts the chart above the buy row", async () => {
    const printing = stubPrinting();
    const { container } = render(<CardFooter printing={printing} />, {
      wrapper: makeWrapper({ [printing.id]: { cardtrader: 4.5 } }),
    });
    // Waits on the chart's own content rather than the Suspense fallback: by
    // this point in the file the lazy chunk is already resolved, so the
    // fallback never renders.
    await screen.findByText("CardTrader", undefined, { timeout: 5000 });

    const text = container.textContent ?? "";
    expect(text).toContain("Buy on");
    expect(text.indexOf("CardTrader")).toBeLessThan(text.indexOf("Buy on"));
  });
});
