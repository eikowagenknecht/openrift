import type { PackPrinting, PackPull } from "@openrift/shared";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ labels: { rarities: {} } }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PullCard } from "./pull-card";

function makePull(overrides: Partial<PackPrinting> = {}): PackPull {
  const printing: PackPrinting = {
    id: "00000000-0000-0000-0000-000000000001",
    cardId: "00000000-0000-0000-0000-000000000002",
    cardName: "Test Card",
    cardSlug: "test-card",
    cardType: "unit",
    cardSuperTypes: [],
    rarity: "common",
    finish: "normal",
    artVariant: "normal",
    isSigned: false,
    language: "EN",
    shortCode: "RB1-001",
    publicCode: "rb1-001",
    setSlug: "RB1",
    ...overrides,
  };
  return { slot: "common", printing };
}

const IMAGE = { face: "front" as const, imageId: "test-image-id-aa" };

describe("PullCard battlefield rotation", () => {
  it("rotates landscape battlefield images so they fit the portrait slot", () => {
    const { container } = render(
      <PullCard pull={makePull({ cardType: "battlefield" })} image={IMAGE} />,
    );
    const wrapper = container.querySelector("img")?.parentElement;
    expect(wrapper?.getAttribute("style")).toContain("rotate(-90deg)");
  });

  it("does not rotate portrait card images", () => {
    const { container } = render(<PullCard pull={makePull({ cardType: "unit" })} image={IMAGE} />);
    const img = container.querySelector("img");
    // The image is rendered directly (no rotation wrapper) so its parent is the
    // outer aspect-card box, not a styled rotation wrapper.
    expect(img?.parentElement?.getAttribute("style")).toBeNull();
  });
});
