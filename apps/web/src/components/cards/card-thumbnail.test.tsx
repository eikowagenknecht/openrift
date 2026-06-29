import type { Printing } from "@openrift/shared";
import { EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { stubPrinting } from "@/test/factories";

const baseDisplay: CardThumbnailDisplay = {
  fancyFan: true,
  gridFoil: false,
  cardTilt: false,
  coarsePointer: false,
  domainColors: {},
  finishLabels: {},
  sizeLabels: {},
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
    const front = makePrintingWithImage("RB1-001");
    const sibling = makePrintingWithImage("RB1-001-foil");
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={[front, sibling]}
        display={{ ...baseDisplay, coarsePointer: false }}
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
    const front = makePrintingWithImage("RB1-001");
    const sibling = makePrintingWithImage("RB1-001-foil");
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={[front, sibling]}
        display={{ ...baseDisplay, coarsePointer: true }}
      />,
    );
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/media/cards/aa/RB1-001-image-id-aa-400w.webp");
    expect(srcs).not.toContain("/media/cards/aa/RB1-001-foil-image-id-aa-400w.webp");
  });
});

describe("CardThumbnail tilt shell", () => {
  // Regression: with cardTilt=true on a coarse-pointer device, SSR rendered
  // the tilt shell (matchMedia is undefined on the server) but the client
  // rendered the plain shell, producing a hydration mismatch on the inline
  // `style` attribute. The bundle now reads through useCoarsePointer (server
  // snapshot `false`), so the first client render matches SSR and the tilt
  // drops away one paint later.
  it("renders without the 3D tilt transform when coarsePointer is true", () => {
    const printing = makePrintingWithImage("RB1-002");
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages
        display={{ ...baseDisplay, cardTilt: true, coarsePointer: true }}
      />,
    );
    const inlineTransforms = [...container.querySelectorAll<HTMLElement>("[style]")]
      .map((el) => el.style.transform)
      .filter(Boolean);
    expect(inlineTransforms.some((value) => value.includes("perspective"))).toBe(false);
  });

  it("renders the 3D tilt transform when cardTilt is on and pointer is fine", () => {
    const printing = makePrintingWithImage("RB1-003");
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages
        display={{ ...baseDisplay, cardTilt: true, coarsePointer: false }}
      />,
    );
    const inlineTransforms = [...container.querySelectorAll<HTMLElement>("[style]")]
      .map((el) => el.style.transform)
      .filter(Boolean);
    expect(inlineTransforms.some((value) => value.includes("perspective"))).toBe(true);
  });
});
