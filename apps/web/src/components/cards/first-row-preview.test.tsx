import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FirstRowCard } from "@/lib/cards-first-row";

const { mockUseLoaderData } = vi.hoisted(() => ({
  mockUseLoaderData: vi.fn<() => { firstRow: FirstRowCard[] }>(),
}));

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({ useLoaderData: mockUseLoaderData }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FirstRowPreview } from "./first-row-preview";

function makeCard(i: number): FirstRowCard {
  return {
    printingId: `p-${i}`,
    cardName: `Card ${i}`,
    thumbnail: `https://cdn.test/p-${i}-400w.webp`,
    full: `https://cdn.test/p-${i}-full.webp`,
  };
}

describe("FirstRowPreview", () => {
  afterEach(() => {
    mockUseLoaderData.mockReset();
  });

  it("renders one img per loader-data card", () => {
    mockUseLoaderData.mockReturnValue({
      firstRow: [makeCard(0), makeCard(1), makeCard(2)],
    });
    const { container } = render(<FirstRowPreview />);
    expect(container.querySelectorAll("img")).toHaveLength(3);
  });

  it("returns null when loader data is empty", () => {
    mockUseLoaderData.mockReturnValue({ firstRow: [] });
    const { container } = render(<FirstRowPreview />);
    expect(container.firstChild).toBeNull();
  });

  it("marks only the first image as fetchpriority=high", () => {
    mockUseLoaderData.mockReturnValue({
      firstRow: [makeCard(0), makeCard(1), makeCard(2)],
    });
    const { container } = render(<FirstRowPreview />);
    const imgs = container.querySelectorAll("img");
    expect(imgs[0]?.getAttribute("fetchpriority")).toBe("high");
    expect(imgs[1]?.getAttribute("fetchpriority")).toBeNull();
    expect(imgs[2]?.getAttribute("fetchpriority")).toBeNull();
  });

  it("sets srcset, sizes, width, height, and alt on every image", () => {
    mockUseLoaderData.mockReturnValue({ firstRow: [makeCard(0), makeCard(1)] });
    const { container } = render(<FirstRowPreview />);
    const imgs = container.querySelectorAll("img");
    for (const img of imgs) {
      expect(img.getAttribute("srcset")).toMatch(/-400w\.webp 400w, .*-full\.webp 800w/);
      expect(img.getAttribute("sizes")).toBeTruthy();
      expect(img.getAttribute("width")).toBe("400");
      expect(img.getAttribute("height")).toBe("558");
      expect(img.getAttribute("alt")).toMatch(/^Card \d+$/);
    }
  });
});
