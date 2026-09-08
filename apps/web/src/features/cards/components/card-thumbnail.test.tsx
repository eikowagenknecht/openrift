import { EMPTY_PRICE_LOOKUP } from "@openrift/shared/price-lookup";
import type { StandardArtFallback } from "@openrift/shared/standard";
import type { Printing } from "@openrift/shared/types/catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import type { PropsWithChildren, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CardThumbnail } from "@/features/cards/components/card-thumbnail";
import type { CardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { stubPrinting } from "@/test/factories";

// No router in these tests, so swap the "Suggest image" Link for a plain span.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

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
  rarityLabels: {},
  prices: EMPTY_PRICE_LOOKUP,
  favoriteMarketplace: "cardtrader",
  compactFmt: String,
  getFallbackArt: () => null,
};

function makePrintingWithImage(slug: string): Printing {
  return stubPrinting({
    card: { slug },
    images: [{ face: "front", imageId: `${slug}-image-id-aa` }],
  });
}

// React synthesizes onMouseEnter from mouseover.
function hoverTile(container: HTMLElement) {
  const tile = container.querySelector("[data-printing-id]");
  if (!tile) {
    throw new Error("thumbnail tile not found");
  }
  fireEvent.mouseOver(tile);
}

function queryStandin(container: HTMLElement) {
  return container.querySelector(".aspect-card.bg-black");
}

function queryFanCover(container: HTMLElement) {
  return container.querySelector(".pointer-events-none.absolute.inset-0.bg-black");
}

describe("CardThumbnail siblings", () => {
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

  it("clears the pending fan timer when unmounted mid-hover", () => {
    vi.useFakeTimers();
    try {
      const front = makePrintingWithImage("RB1-001");
      const sibling = makePrintingWithImage("RB1-001-foil");
      const { container, unmount } = render(
        <CardThumbnail
          printing={front}
          onClick={() => {}}
          showImages
          siblings={[front, sibling]}
          display={{ ...baseDisplay, coarsePointer: false }}
        />,
      );

      hoverTile(container);
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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
    expect(queryFanCover(container)).toBeNull();

    hoverTile(container);
    const cover = queryFanCover(container);
    expect(cover).not.toBeNull();
    expect(cover?.getAttribute("style")).toContain("--fan");
  });

  it("shows at most five stacked edges while the fan is closed", () => {
    const front = makePrintingWithImage("RB1-001");
    const siblings = [
      front,
      ...Array.from({ length: 8 }, (_, i) => makePrintingWithImage(`RB1-001-v${i}`)),
    ];
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={siblings}
        display={baseDisplay}
      />,
    );
    const layers = [...container.querySelectorAll(".origin-bottom")];
    expect(layers).toHaveLength(8);

    const styles = layers.map((layer) => layer.getAttribute("style") ?? "");
    const visibleWhenClosed = styles.filter((style) => !style.includes("opacity: var(--fan"));
    expect(visibleWhenClosed).toHaveLength(5);

    expect(styles.slice(-5).every((style) => !style.includes("opacity: var(--fan"))).toBe(true);
  });

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
    expect(container.querySelector('img[src*="RB1-001-image"]')).not.toBeNull();
  });
});

describe("CardThumbnail standard-art fallback", () => {
  function fallbackTo(imageId: string, language: string): StandardArtFallback {
    const image = { face: "front" as const, imageId };
    const printing = stubPrinting({ language, images: [image] });
    return { printing, image };
  }
  it("shows the fallback art with the centered notice and no language badge for a same-language borrow", () => {
    const printing = stubPrinting({ card: { slug: "RB1-040" }, images: [] });
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages
        display={{ ...baseDisplay, getFallbackArt: () => fallbackTo("fallback-image-id", "EN") }}
      />,
      { wrapper: makeWrapper() },
    );
    expect(container.querySelector('img[src*="fallback-image-id"]')).not.toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(container.textContent).toContain("Placeholder");
    expect(container.textContent).toContain("(suggest image)");
    expect(container.textContent).not.toContain("EN");
  });

  it("adds a language badge when the borrowed art crossed languages", () => {
    const printing = stubPrinting({ card: { slug: "RB1-045" }, images: [], language: "SC" });
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages
        display={{ ...baseDisplay, getFallbackArt: () => fallbackTo("fallback-image-id", "EN") }}
      />,
      { wrapper: makeWrapper() },
    );
    expect(container.textContent).toContain("EN");
  });

  it("adds a badge per property the shown art doesn't depict (markers, signed)", () => {
    const printing = stubPrinting({
      card: { slug: "RB1-046" },
      images: [],
      markers: [{ id: "m1", slug: "promo", label: "Promo", description: null }],
      isSigned: true,
    });
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages
        display={{ ...baseDisplay, getFallbackArt: () => fallbackTo("fallback-image-id", "EN") }}
      />,
      { wrapper: makeWrapper() },
    );
    expect(container.textContent).toContain("Promo");
    expect(container.textContent).toContain("Signed");
  });

  it("borrows standard art for an imageless sibling when the fan opens", () => {
    const front = makePrintingWithImage("RB1-050");
    const sibling = stubPrinting({ card: { slug: "RB1-050" }, images: [] });
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={[front, sibling]}
        display={{
          ...baseDisplay,
          coarsePointer: false,
          getFallbackArt: () => fallbackTo("fan-fallback-image-id", "EN"),
        }}
      />,
      { wrapper: makeWrapper() },
    );
    hoverTile(container);
    expect(container.querySelector('img[src*="fan-fallback-image-id"]')).not.toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("advances a fanned sibling from a failed image to the borrowed art", () => {
    const front = makePrintingWithImage("RB1-051");
    const sibling = makePrintingWithImage("RB1-051-foil");
    const { container } = render(
      <CardThumbnail
        printing={front}
        onClick={() => {}}
        showImages
        siblings={[front, sibling]}
        display={{
          ...baseDisplay,
          coarsePointer: false,
          getFallbackArt: () => fallbackTo("fan-fallback-image-id", "EN"),
        }}
      />,
      { wrapper: makeWrapper() },
    );
    hoverTile(container);
    const siblingImg = container.querySelector('img[src*="RB1-051-foil"]');
    if (!siblingImg) {
      throw new Error("sibling image not found");
    }
    fireEvent.error(siblingImg);
    expect(container.querySelector('img[src*="fan-fallback-image-id"]')).not.toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("keeps the drawn placeholder (with the notice) when no fallback art resolves", () => {
    const printing = stubPrinting({ card: { slug: "RB1-041" }, images: [] });
    const { container } = render(
      <CardThumbnail printing={printing} onClick={() => {}} showImages display={baseDisplay} />,
      { wrapper: makeWrapper() },
    );
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    expect(container.textContent).toContain("(suggest image)");
  });

  it("keeps the notice outside the dimmed image layer on unowned cards", () => {
    const printing = stubPrinting({ card: { slug: "RB1-047" }, images: [] });
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages
        dimmed
        display={{ ...baseDisplay, getFallbackArt: () => fallbackTo("fallback-image-id", "EN") }}
      />,
      { wrapper: makeWrapper() },
    );
    const notice = container.querySelector('a, [class*="pointer-events-auto"]');
    expect(notice).not.toBeNull();
    expect(notice?.closest(".opacity-50")).toBeNull();
  });

  it("advances from a failed printing image to the fallback art", () => {
    const printing = makePrintingWithImage("RB1-042");
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages
        display={{ ...baseDisplay, getFallbackArt: () => fallbackTo("fallback-image-id", "EN") }}
      />,
      { wrapper: makeWrapper() },
    );
    const img = container.querySelector('img[src*="RB1-042"]');
    if (!img) {
      throw new Error("front image not found");
    }
    fireEvent.error(img);
    expect(container.querySelector('img[src*="fallback-image-id"]')).not.toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("falls back to placeholder art when the fallback image also fails to load", () => {
    const printing = stubPrinting({ card: { slug: "RB1-043" }, images: [] });
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages
        display={{ ...baseDisplay, getFallbackArt: () => fallbackTo("fallback-image-id", "EN") }}
      />,
      { wrapper: makeWrapper() },
    );
    const img = container.querySelector('img[src*="fallback-image-id"]');
    if (!img) {
      throw new Error("fallback image not found");
    }
    fireEvent.error(img);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    expect(container.querySelector('img[src*="fallback-image-id"]')).toBeNull();
  });

  it("does not resolve fallback art when images are hidden", () => {
    const printing = stubPrinting({ card: { slug: "RB1-044" }, images: [] });
    const getFallbackArt = vi.fn(() => fallbackTo("fallback-image-id", "EN"));
    const { container } = render(
      <CardThumbnail
        printing={printing}
        onClick={() => {}}
        showImages={false}
        display={{ ...baseDisplay, getFallbackArt }}
      />,
      { wrapper: makeWrapper() },
    );
    expect(getFallbackArt).not.toHaveBeenCalled();
    expect(container.querySelector('[role="img"]')).not.toBeNull();
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

describe("CardThumbnail price", () => {
  const pricedDisplay: CardThumbnailDisplay = {
    ...baseDisplay,
    prices: { get: () => 12.5, has: () => true },
    compactFmt: (value) => `${value} €`,
  };

  function queryMarketplaceIcon(container: HTMLElement) {
    return container.querySelector<HTMLImageElement>('img[src*="/images/external/"]');
  }

  it("shows the favorite marketplace icon in front of the price", () => {
    const printing = makePrintingWithImage("RB1-004");
    const { container } = render(
      <CardThumbnail printing={printing} onClick={() => {}} showImages display={pricedDisplay} />,
      { wrapper: makeWrapper() },
    );
    const icon = queryMarketplaceIcon(container);
    expect(icon?.src).toContain("cardtrader");
    expect(icon?.nextSibling?.textContent).toBe("12.5 €");
  });

  it("omits the icon when the printing has no price", () => {
    const printing = makePrintingWithImage("RB1-005");
    const { container } = render(
      <CardThumbnail printing={printing} onClick={() => {}} showImages display={baseDisplay} />,
      { wrapper: makeWrapper() },
    );
    expect(queryMarketplaceIcon(container)).toBeNull();
  });
});

describe("CardThumbnail tilt shell", () => {
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
