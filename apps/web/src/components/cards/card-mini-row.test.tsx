import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardMiniRow } from "./card-mini-row";

describe("CardMiniRow", () => {
  it("leads with a strip-shaped art frame", () => {
    const { container } = render(<CardMiniRow src="/x-120w.webp" />);

    const frame = container.querySelector("span span");
    expect(frame?.className).toContain("aspect-[88/63]");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/x-120w.webp");
  });

  it("renders the domain bar with the domain color", () => {
    const { container } = render(<CardMiniRow src="/x.webp" domains={["chaos"]} />);

    const bar = container.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(bar?.className).toContain("self-stretch");
    // chaos seeds to #6B4891; jsdom normalizes hex to rgb.
    expect(bar?.style.backgroundColor).toBe("rgb(107, 72, 145)");
  });

  it("splits the bar 50/50 for a dual-domain card", () => {
    const { container } = render(<CardMiniRow src="/x.webp" domains={["fury", "calm"]} />);

    const bar = container.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(bar?.style.background).toContain("50%");
  });

  it("prefers live domain colors over the seed colors", () => {
    const { container } = render(
      <CardMiniRow src="/x.webp" domains={["chaos"]} domainColors={{ chaos: "#000000" }} />,
    );

    const bar = container.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(bar?.style.backgroundColor).toBe("rgb(0, 0, 0)");
  });

  it("omits the domain bar when no domains are given", () => {
    const { container } = render(<CardMiniRow src="/x.webp" />);

    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("omits the domain bar for an empty domains array", () => {
    // A colorless-but-unresolved card must not render a grey sliver of nothing.
    const { container } = render(<CardMiniRow src="/x.webp" domains={[]} />);

    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("shows the rarity icon and short code in the meta column", () => {
    const { container } = render(
      <CardMiniRow src="/x.webp" rarity="showcase" shortCode="OGN-042" />,
    );

    const icon = container.querySelector('img[src="/images/rarities/showcase-28x28.webp"]');
    expect(icon).not.toBeNull();
    expect(container.textContent).toContain("OGN-042");
  });

  it("labels the rarity icon from the live labels", () => {
    const { container } = render(
      <CardMiniRow src="/x.webp" rarity="showcase" rarityLabels={{ showcase: "Showcase" }} />,
    );

    const icon = container.querySelector('img[src="/images/rarities/showcase-28x28.webp"]');
    expect(icon?.getAttribute("title")).toBe("Showcase");
  });

  it("drops the meta column entirely when there is no rarity or short code", () => {
    const { container } = render(<CardMiniRow src="/x.webp" domains={["fury"]} />);

    // Art frame plus bar, and nothing else — the column must not reserve its
    // w-20 when there is nothing to put in it.
    expect(container.textContent).toBe("");
    expect(container.querySelectorAll("span.w-20")).toHaveLength(0);
  });

  it("renders a short code without a rarity", () => {
    const { container } = render(<CardMiniRow src="/x.webp" shortCode="OGN-042" />);

    expect(container.textContent).toContain("OGN-042");
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("hides the meta column below sm only when asked", () => {
    const { container: shown } = render(<CardMiniRow src="/x.webp" shortCode="OGN-042" />);
    expect(shown.querySelector("span.flex.w-20")).not.toBeNull();

    const { container: hidden } = render(
      <CardMiniRow src="/x.webp" shortCode="OGN-042" hideMetaOnMobile />,
    );
    const meta = hidden.querySelector("span.hidden");
    expect(meta?.className).toContain("sm:flex");
  });

  it("passes rarity and domains through to the art placeholder", () => {
    const { container } = render(
      <CardMiniRow imageId={null} rarity="showcase" domains={["chaos"]} />,
    );

    // No card art, so the strip carries the domain-tinted rarity watermark
    // rather than an empty box.
    const placeholder = container.querySelector<HTMLElement>("span.absolute");
    expect(placeholder?.style.backgroundImage).toContain("linear-gradient");
    expect(placeholder?.querySelector("img")?.className).toContain("opacity-25");
  });

  it("forwards sizing overrides to the cluster and the art separately", () => {
    const { container } = render(
      <CardMiniRow src="/x.webp" className="self-stretch" artClassName="h-9" />,
    );

    const cluster = container.firstElementChild;
    expect(cluster?.className).toContain("self-stretch");
    expect(cluster?.querySelector("span")?.className).toContain("h-9");
  });
});
