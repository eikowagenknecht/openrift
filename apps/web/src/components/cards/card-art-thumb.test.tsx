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

  it("renders an empty muted frame when no image and no fallback are given", () => {
    const { container } = render(<CardArtThumb imageId={null} />);

    expect(container.querySelector("img")).toBeNull();
    const frame = container.querySelector("span");
    expect(frame?.className).toContain("bg-muted");
    expect(frame?.textContent).toBe("");
  });

  it("merges sizing utilities from className onto the frame", () => {
    const { container } = render(<CardArtThumb src="/x.webp" className="h-32 self-start" />);

    const frame = container.querySelector("span");
    expect(frame?.className).toContain("h-32");
    expect(frame?.className).toContain("self-start");
  });
});
