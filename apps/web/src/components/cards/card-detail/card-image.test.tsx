import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { CardImage } from "./card-image";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["init"], {
    enums: {
      cardTypes: [],
      rarities: [],
      domains: [],
      superTypes: [],
      finishes: [],
      artVariants: [],
      deckFormats: [],
      deckZones: [],
      languages: [],
    },
    keywordStyles: {},
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

const noopRef = () => {};

describe("CardImage preview overlay", () => {
  it("renders a PREVIEW ribbon when the printing's set is unreleased", () => {
    const printing = stubPrinting({ setReleased: false });
    const { getByText } = render(
      <CardImage
        innerRef={noopRef}
        printing={printing}
        orientation="portrait"
        showImages={false}
        showFoil={false}
        showShimmer={false}
      />,
      { wrapper: makeWrapper() },
    );
    expect(getByText("Preview")).toBeTruthy();
  });

  it("does not render the ribbon for released sets", () => {
    const printing = stubPrinting({ setReleased: true });
    const { queryByText } = render(
      <CardImage
        innerRef={noopRef}
        printing={printing}
        orientation="portrait"
        showImages={false}
        showFoil={false}
        showShimmer={false}
      />,
      { wrapper: makeWrapper() },
    );
    expect(queryByText("Preview")).toBeNull();
  });
});
