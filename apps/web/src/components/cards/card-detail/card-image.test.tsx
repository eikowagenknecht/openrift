import { imageUrl } from "@openrift/shared";
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
    keywords: {},
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

const noopRef = () => {};

const stubFrontImage = {
  face: "front" as const,
  imageId: "019d6c25-b081-74b3-a901-64da4ae0abcd",
};

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

describe("CardImage hero (responsive image)", () => {
  it("renders a srcset with both -400w and -full URLs and a sizes attribute", () => {
    const printing = stubPrinting({
      images: [stubFrontImage],
      card: { name: "Hero Card" },
    });
    const { getByAltText } = render(
      <CardImage
        innerRef={noopRef}
        printing={printing}
        orientation="portrait"
        showImages
        showFoil={false}
        showShimmer={false}
      />,
      { wrapper: makeWrapper() },
    );
    const img = getByAltText("Hero Card") as HTMLImageElement;
    const srcset = img.getAttribute("srcset") ?? "";
    expect(srcset).toContain(`${imageUrl(stubFrontImage.imageId, "400w")} 400w`);
    expect(srcset).toContain(`${imageUrl(stubFrontImage.imageId, "full")} 800w`);
    expect(img.getAttribute("sizes")).toBe("(min-width: 768px) 376px, 100vw");
    expect(img.getAttribute("src")).toBe(imageUrl(stubFrontImage.imageId, "400w"));
  });

  it("renders explicit width/height matching portrait dimensions", () => {
    const printing = stubPrinting({
      images: [stubFrontImage],
      card: { name: "Portrait Card" },
    });
    const { getByAltText } = render(
      <CardImage
        innerRef={noopRef}
        printing={printing}
        orientation="portrait"
        showImages
        showFoil={false}
        showShimmer={false}
      />,
      { wrapper: makeWrapper() },
    );
    const img = getByAltText("Portrait Card") as HTMLImageElement;
    expect(img.getAttribute("width")).toBe("400");
    expect(img.getAttribute("height")).toBe("558");
  });

  it("renders explicit width/height matching landscape dimensions", () => {
    const printing = stubPrinting({
      images: [stubFrontImage],
      card: { name: "Landscape Card", type: "battlefield" },
    });
    const { getByAltText } = render(
      <CardImage
        innerRef={noopRef}
        printing={printing}
        orientation="landscape"
        showImages
        showFoil={false}
        showShimmer={false}
      />,
      { wrapper: makeWrapper() },
    );
    const img = getByAltText("Landscape Card") as HTMLImageElement;
    expect(img.getAttribute("width")).toBe("558");
    expect(img.getAttribute("height")).toBe("400");
  });

  it("marks the hero image as high fetch priority", () => {
    const printing = stubPrinting({
      images: [stubFrontImage],
      card: { name: "Priority Card" },
    });
    const { getByAltText } = render(
      <CardImage
        innerRef={noopRef}
        printing={printing}
        orientation="portrait"
        showImages
        showFoil={false}
        showShimmer={false}
      />,
      { wrapper: makeWrapper() },
    );
    const img = getByAltText("Priority Card");
    const priority = img.getAttribute("fetchpriority") ?? img.getAttribute("fetchPriority");
    expect(priority).toBe("high");
  });
});
