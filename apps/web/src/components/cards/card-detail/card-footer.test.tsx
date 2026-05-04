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

describe("CardFooter sparkline lazy boundary", () => {
  let resetDisplay: () => void;
  beforeEach(() => {
    resetDisplay = createStoreResetter(useDisplayStore);
  });
  afterEach(() => resetDisplay());

  it("does not render the sparkline or its fallback when no price is available", () => {
    const printing = stubPrinting();
    render(<CardFooter printing={printing} />, { wrapper: makeWrapper({}) });
    expect(screen.queryByTestId("sparkline-skeleton")).toBeNull();
  });

  it("renders the Suspense fallback then resolves the lazy sparkline when a price exists", async () => {
    const printing = stubPrinting();
    render(<CardFooter printing={printing} />, {
      wrapper: makeWrapper({ [printing.id]: { cardtrader: 4.5 } }),
    });
    const skeleton = await screen.findByTestId("sparkline-skeleton");
    await waitForElementToBeRemoved(skeleton);
  });
});
