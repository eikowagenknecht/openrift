import { render } from "@testing-library/react";
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
});
