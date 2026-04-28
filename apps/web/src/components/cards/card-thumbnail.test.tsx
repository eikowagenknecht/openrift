import type { Printing } from "@openrift/shared";
import { EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { coarsePointerState } = vi.hoisted(() => ({
  coarsePointerState: { value: false },
}));

vi.mock("@/lib/pointer", () => ({
  get IS_COARSE_POINTER() {
    return coarsePointerState.value;
  },
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { stubPrinting } from "@/test/factories";

// oxlint-disable-next-line import/first -- must import after vi.mock
import type { CardThumbnailDisplay } from "./card-thumbnail";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardThumbnail } from "./card-thumbnail";

const display: CardThumbnailDisplay = {
  fancyFan: true,
  gridFoil: false,
  cardTilt: false,
  domainColors: {},
  finishLabels: {},
  prices: EMPTY_PRICE_LOOKUP,
  favoriteMarketplace: "cardtrader",
  compactFmt: String,
};

function makePrintingWithImage(slug: string): Printing {
  return stubPrinting({
    card: { slug },
    images: [{ face: "front", imageId: `${slug}-image-id-aa` }],
  });
}

describe("CardThumbnail siblings", () => {
  it("renders sibling thumbnails on fine-pointer devices", () => {
    coarsePointerState.value = false;
    const front = makePrintingWithImage("RB1-001");
    const sibling = makePrintingWithImage("RB1-001-foil");
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={[front, sibling]}
        display={display}
      />,
    );
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/media/cards/aa/RB1-001-image-id-aa-400w.webp");
    expect(srcs).toContain("/media/cards/aa/RB1-001-foil-image-id-aa-400w.webp");
  });

  // The fan-out is hover-driven (`hover:[--fan:1]`), so on coarse-pointer
  // devices the sibling images sit hidden behind the front card and only
  // their borders are ever visible. Loading the <img> is pure waste.
  it("does not load sibling thumbnails on coarse-pointer devices", () => {
    coarsePointerState.value = true;
    const front = makePrintingWithImage("RB1-001");
    const sibling = makePrintingWithImage("RB1-001-foil");
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={[front, sibling]}
        display={display}
      />,
    );
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/media/cards/aa/RB1-001-image-id-aa-400w.webp");
    expect(srcs).not.toContain("/media/cards/aa/RB1-001-foil-image-id-aa-400w.webp");
  });
});
