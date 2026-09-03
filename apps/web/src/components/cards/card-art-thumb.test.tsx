import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardArtThumb } from "./card-art-thumb";

describe("CardArtThumb", () => {
  it("locks the frame to the card aspect ratio and crops with object-cover", () => {
    // The whole point of the component: the frame holds aspect-card and the
    // image is object-cover, so a too-narrow flex/grid cell can't distort it.
    const { container } = render(<CardArtThumb src="/media/cards/ab/card-120w.webp" alt="" />);

    const frame = container.querySelector("span");
    expect(frame?.className).toContain("aspect-card");
    expect(frame?.className).toContain("overflow-hidden");

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/media/cards/ab/card-120w.webp");
    expect(img?.className).toContain("object-cover");
  });

  it("rings the frame and washes the art when the printing is a foil", () => {
    const { container } = render(<CardArtThumb src="/x.webp" foil />);

    const frame = container.querySelector("span");
    expect(frame?.className).toContain("ring-border-accent/60");
    // The still rainbow, not the shimmer keyframe: these frames lead list rows.
    const wash = container.querySelector(".bg-foil");
    expect(wash).not.toBeNull();
    expect(wash?.className).not.toContain("animate-foil-shimmer");
  });

  it("leaves the ring and the wash off a normal printing", () => {
    const { container } = render(<CardArtThumb src="/x.webp" />);

    expect(container.querySelector("span")?.className).not.toContain("ring-border-accent");
    expect(container.querySelector(".bg-foil")).toBeNull();
  });

  it("resolves an imageId through imageUrl at the requested variant", () => {
    const { container } = render(<CardArtThumb imageId="0123456789abcdef" variant="400w" />);

    const img = container.querySelector("img");
    // imageUrl prefixes the dir with the last 2 hex chars of the id.
    expect(img?.getAttribute("src")).toBe("/media/cards/ef/0123456789abcdef-400w.webp");
  });

  it("prefers an explicit src over imageId", () => {
    const { container } = render(<CardArtThumb src="/explicit.webp" imageId="0123456789abcdef" />);

    expect(container.querySelector("img")?.getAttribute("src")).toBe("/explicit.webp");
  });

  it("renders the fallback (and no img) when there is no image", () => {
    const { container } = render(
      <CardArtThumb fallback={<span data-testid="empty" className="size-full" />} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-testid="empty"]')).not.toBeNull();
  });

  it("renders the generic no-image placeholder when no image, fallback, or rarity is given", () => {
    const { container } = render(<CardArtThumb imageId={null} />);

    // No card <img>, but the muted frame carries a placeholder glyph (an svg),
    // so the tile reads as intentionally art-less rather than broken.
    expect(container.querySelector("img")).toBeNull();
    const frame = container.querySelector("span");
    expect(frame?.className).toContain("bg-muted");
    expect(frame?.querySelector("svg")).not.toBeNull();
  });

  it("shows a faded rarity-icon watermark when a rarity is given and no image resolves", () => {
    const { container } = render(<CardArtThumb imageId={null} rarity="showcase" />);

    const watermark = container.querySelector("img");
    expect(watermark?.getAttribute("src")).toBe("/images/rarities/showcase-28x28.webp");
    expect(watermark?.className).toContain("opacity-25");
    // Width-only sizing: the frame is portrait, so forcing both axes (size-1/2)
    // would stretch the square rarity icon vertically. Keep it width-constrained.
    expect(watermark?.className).toContain("w-1/2");
    expect(watermark?.className).not.toContain("size-1/2");
  });

  it("tints the placeholder with the domain color when domains are given", () => {
    const { container } = render(
      <CardArtThumb imageId={null} rarity="showcase" domains={["chaos"]} />,
    );

    const placeholder = container.querySelector<HTMLElement>("span.absolute");
    expect(placeholder?.style.backgroundImage).toContain("linear-gradient");
  });

  it("does not tint the placeholder when no domains are given", () => {
    const { container } = render(<CardArtThumb imageId={null} rarity="showcase" />);

    const placeholder = container.querySelector<HTMLElement>("span.absolute");
    expect(placeholder?.style.backgroundImage).toBe("");
  });

  it("rotates landscape (Battlefield) art so it fills the portrait frame", () => {
    const { container } = render(<CardArtThumb src="/bf-120w.webp" landscape alt="" />);

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/bf-120w.webp");
    // The image sits inside a rotation wrapper, not directly in the frame.
    expect(img?.parentElement?.style.transform).toContain("rotate(-90deg)");
  });

  it("leaves portrait art unrotated", () => {
    const { container } = render(<CardArtThumb src="/x-120w.webp" alt="" />);

    const img = container.querySelector("img");
    expect(img?.parentElement?.style.transform ?? "").not.toContain("rotate");
  });

  it("merges sizing utilities from className onto the frame", () => {
    const { container } = render(<CardArtThumb src="/x.webp" className="h-32 self-start" />);

    const frame = container.querySelector("span");
    expect(frame?.className).toContain("h-32");
    expect(frame?.className).toContain("self-start");
  });

  // Ported from the deleted DeckListRowArt, which grew these cases in the deck
  // list. They belong to every shape now that one frame serves both.
  describe("art missing on the server", () => {
    it.each(["card", "strip"] as const)(
      "drops back to the placeholder when the file 404s (%s)",
      (shape) => {
        // A printing can be catalogued before its art is rehosted, so the URL
        // exists and 404s. Without this the row keeps the broken-image glyph.
        const { container } = render(<CardArtThumb shape={shape} src="/gone-120w.webp" />);
        const img = container.querySelector("img");
        expect(img).not.toBeNull();

        fireEvent.error(img!);
        expect(container.querySelector("img")).toBeNull();
      },
    );

    it("retries a different source after one failed", () => {
      const { container, rerender } = render(<CardArtThumb shape="strip" src="/gone-120w.webp" />);
      fireEvent.error(container.querySelector("img")!);

      rerender(<CardArtThumb shape="strip" src="/other-120w.webp" />);
      expect(container.querySelector("img")).not.toBeNull();
    });

    it("falls back to the rarity watermark rather than an empty box", () => {
      // The old deck-row box went blank here; the shared frame keeps the card's
      // identity visible instead.
      const { container } = render(
        <CardArtThumb shape="strip" src="/gone-120w.webp" rarity="showcase" domains={["fury"]} />,
      );
      fireEvent.error(container.querySelector("img")!);

      const watermark = container.querySelector("img");
      expect(watermark?.getAttribute("src")).toBe("/images/rarities/showcase-28x28.webp");
    });
  });

  describe('shape="strip"', () => {
    it("uses the landscape-card ratio instead of the portrait card frame", () => {
      const { container } = render(<CardArtThumb shape="strip" src="/x-120w.webp" />);

      const frame = container.querySelector("span");
      // 88/63 is the inverse of --aspect-card, so battlefield art fills it exactly.
      expect(frame?.className).toContain("aspect-[88/63]");
      expect(frame?.className).not.toContain("aspect-card");
      // Defaults to h-6 so rows line up without every call site restating it.
      expect(frame?.className).toContain("h-6");
    });

    it("crops portrait art to the illustration band, not its middle", () => {
      const { container } = render(<CardArtThumb shape="strip" src="/x-120w.webp" />);

      const img = container.querySelector("img");
      // At 24px tall a 50% crop lands on the type line; 18% lands on the art.
      expect(img?.className).toContain("object-[50%_18%]");
    });

    it("leaves landscape art uncropped and unrotated", () => {
      const { container } = render(<CardArtThumb shape="strip" src="/bf-120w.webp" landscape />);

      const img = container.querySelector("img");
      // The strip is already the art's own ratio: no crop offset, no rotation
      // wrapper. This is the whole reason battlefields get a strip.
      expect(img?.className).not.toContain("object-[50%_18%]");
      expect(img?.parentElement?.style.transform ?? "").not.toContain("rotate");
    });

    it("sizes the placeholder glyph off the short axis so it stays square", () => {
      const { container } = render(<CardArtThumb shape="strip" imageId={null} rarity="showcase" />);

      const watermark = container.querySelector("img");
      // A strip is wide, so height is the short axis — the mirror of the
      // portrait frame's width-only constraint.
      expect(watermark?.className).toContain("h-1/2");
      expect(watermark?.className).not.toContain("w-1/2");
    });

    it("still overrides its default height from className", () => {
      const { container } = render(<CardArtThumb shape="strip" src="/x.webp" className="h-9" />);

      const frame = container.querySelector("span");
      expect(frame?.className).toContain("h-9");
      expect(frame?.className).not.toContain("h-6");
    });
  });
});
