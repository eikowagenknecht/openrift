import type { Printing } from "@openrift/shared";
import { EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { stubPrinting } from "@/test/factories";

// CardPlaceholderImage reads domain colors through a suspense query, so tests
// that render placeholder art need a QueryClient with the init data seeded.
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

// React synthesizes onMouseEnter from mouseover, so this triggers the tile's
// fanMouseEnter handler (which mounts the deferred sibling faces).
function hoverTile(container: HTMLElement) {
  const tile = container.querySelector("[data-printing-id]");
  if (!tile) {
    throw new Error("thumbnail tile not found");
  }
  fireEvent.mouseOver(tile);
}

// The black stand-in card that renders sibling edges before the faces mount.
function queryStandin(container: HTMLElement) {
  return container.querySelector(".aspect-card.bg-black");
}

// The black overlay that re-covers mounted faces while the fan is closed.
function queryFanCover(container: HTMLElement) {
  return container.querySelector(".pointer-events-none.absolute.inset-0.bg-black");
}

describe("CardThumbnail siblings", () => {
  // Sibling faces are invisible until the hover fan-out, so they mount on
  // first hover: no image download and no placeholder DOM on page load.
  it("mounts sibling thumbnails on first hover, not on mount", () => {
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
    const closedSrcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(closedSrcs).toContain("/media/cards/aa/RB1-001-image-id-aa-400w.webp");
    expect(closedSrcs).not.toContain("/media/cards/aa/RB1-001-foil-image-id-aa-400w.webp");
    expect(queryStandin(container)).not.toBeNull();

    hoverTile(container);
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/media/cards/aa/RB1-001-foil-image-id-aa-400w.webp");
  });

  it("re-covers mounted sibling faces in black while the fan is closed", () => {
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
    // No cover while the stand-in card is showing — it would be redundant.
    expect(queryFanCover(container)).toBeNull();

    hoverTile(container);
    // Once the face is mounted it stays mounted, so the closed look is
    // restored by the cover (opacity driven by the fan's --fan variable).
    const cover = queryFanCover(container);
    expect(cover).not.toBeNull();
    expect(cover?.getAttribute("style")).toContain("--fan");
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
    hoverTile(container);
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/media/cards/aa/RB1-001-image-id-aa-400w.webp");
    expect(srcs).not.toContain("/media/cards/aa/RB1-001-foil-image-id-aa-400w.webp");
  });

  it("renders placeholder art (not a bare gray box) for imageless siblings on hover", () => {
    const front = makePrintingWithImage("RB1-001");
    const sibling = stubPrinting({ card: { slug: "RB1-001" }, images: [] });
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={[front, sibling]}
        display={{ ...baseDisplay, coarsePointer: false }}
      />,
      { wrapper: makeWrapper() },
    );
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(queryStandin(container)).not.toBeNull();

    hoverTile(container);
    const placeholder = container.querySelector('[role="img"]');
    expect(placeholder).not.toBeNull();
    // Hidden from the a11y tree so it doesn't pollute the front card's button name.
    expect(placeholder?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(queryStandin(container)).toBeNull();
  });

  it("keeps the cheap stand-in stack for imageless siblings on coarse-pointer devices", () => {
    const front = makePrintingWithImage("RB1-001");
    const sibling = stubPrinting({ card: { slug: "RB1-001" }, images: [] });
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={[front, sibling]}
        display={{ ...baseDisplay, coarsePointer: true }}
      />,
    );
    hoverTile(container);
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(queryStandin(container)).not.toBeNull();
  });
});

describe("CardThumbnail image error fallback", () => {
  it("swaps the front image for placeholder art when it fails to load", () => {
    const printing = makePrintingWithImage("RB1-020");
    const { container } = render(
      <CardThumbnail printing={printing} onClick={() => {}} showImages display={baseDisplay} />,
      { wrapper: makeWrapper() },
    );
    expect(container.querySelector('[role="img"]')).toBeNull();

    const img = container.querySelector('img[src*="RB1-020"]');
    if (!img) {
      throw new Error("front image not found");
    }
    fireEvent.error(img);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    expect(container.querySelector('img[src*="RB1-020"]')).toBeNull();
  });

  it("swaps a fanned sibling's image for its placeholder when it fails to load", () => {
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
      { wrapper: makeWrapper() },
    );
    hoverTile(container);

    const siblingImg = container.querySelector('img[src*="RB1-001-foil"]');
    if (!siblingImg) {
      throw new Error("sibling image not found");
    }
    fireEvent.error(siblingImg);
    const placeholder = container.querySelector('[role="img"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.closest('[aria-hidden="true"]')).not.toBeNull();
    // The front card's image is untouched by the sibling's failure.
    expect(container.querySelector('img[src*="RB1-001-image"]')).not.toBeNull();
  });
});

describe("CardThumbnail placeholder promo label", () => {
  const promoMarker = { id: "m1", slug: "promo", label: "Promo", description: null };
  const judgeMarker = { id: "m2", slug: "judge", label: "Judge", description: null };

  it("shows the promo marker's label on placeholder art", () => {
    const printing = stubPrinting({
      card: { slug: "RB1-010", name: "Stamped Scout" },
      images: [],
      markers: [promoMarker],
    });
    const { container } = render(
      <CardThumbnail printing={printing} onClick={() => {}} showImages display={baseDisplay} />,
      { wrapper: makeWrapper() },
    );
    expect(container.textContent).toContain("Promo");
  });

  it("does not surface other marker labels on placeholder art", () => {
    const printing = stubPrinting({
      card: { slug: "RB1-011", name: "Stamped Scout" },
      images: [],
      markers: [judgeMarker],
    });
    const { container } = render(
      <CardThumbnail printing={printing} onClick={() => {}} showImages display={baseDisplay} />,
      { wrapper: makeWrapper() },
    );
    expect(container.textContent).not.toContain("Judge");
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
