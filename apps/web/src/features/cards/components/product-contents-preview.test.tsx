import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => {
    let path = to;
    for (const [key, value] of Object.entries(params ?? {})) {
      path = path.replace(`$${key}`, value);
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/features/cards/components/card-browser-layout", () => ({
  CardBrowserLayout: ({ gridSlot }: { gridSlot: ReactNode }) => <div>{gridSlot}</div>,
}));

const { stubPrinting } = await import("@/test/factories");
const { ProductContentsPreview } = await import("./product-contents-preview");

const PRINTINGS = [
  stubPrinting({
    id: "p1",
    cardId: "c1",
    publicCode: "OGN-001/298",
    images: [{ face: "front", imageId: "img-1" }],
    card: { slug: "jinx-rebel", name: "Jinx, Rebel", types: ["unit"] },
  }),
  stubPrinting({
    id: "p2",
    cardId: "c2",
    publicCode: "OGN-002/298",
    images: [{ face: "front", imageId: "img-2" }],
    card: { slug: "hextech-ray", name: "Hextech Ray", types: ["spell"] },
  }),
];

const QUANTITIES = { p1: 2, p2: 1 };

describe("ProductContentsPreview", () => {
  it("links every card to its detail page so crawlers reach them from the product", () => {
    const { container } = render(
      <ProductContentsPreview printings={PRINTINGS} quantityByPrintingId={QUANTITIES} />,
    );
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/cards/jinx-rebel", "/cards/hextech-ray"]);
  });

  it("renders real img tags carrying the card name as alt text", () => {
    const { container } = render(
      <ProductContentsPreview printings={PRINTINGS} quantityByPrintingId={QUANTITIES} />,
    );
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs.map((img) => img.getAttribute("alt"))).toEqual(["Jinx, Rebel", "Hextech Ray"]);
    for (const img of imgs) {
      expect(img.getAttribute("src")).toBeTruthy();
      expect(img.getAttribute("srcset")).toContain("800w");
    }
  });

  it("shows the card name, collector code, and product quantity as text", () => {
    const { getByText } = render(
      <ProductContentsPreview printings={PRINTINGS} quantityByPrintingId={QUANTITIES} />,
    );
    expect(getByText("Jinx, Rebel")).toBeTruthy();
    expect(getByText("OGN-001/298 · ×2")).toBeTruthy();
    expect(getByText("OGN-002/298 · ×1")).toBeTruthy();
  });

  it("omits the quantity suffix for a printing with no recorded quantity", () => {
    const { getByText } = render(
      <ProductContentsPreview printings={PRINTINGS} quantityByPrintingId={{}} />,
    );
    expect(getByText("OGN-001/298")).toBeTruthy();
  });

  it("falls back to a placeholder box and keeps the link when a printing has no image", () => {
    const noArt = [stubPrinting({ id: "p3", images: [], card: { slug: "artless" } })];
    const { container } = render(
      <ProductContentsPreview printings={noArt} quantityByPrintingId={{}} />,
    );
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/cards/artless");
  });
});
