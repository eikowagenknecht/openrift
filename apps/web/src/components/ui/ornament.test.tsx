import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrnamentBase, OrnamentCorners, OrnamentRule } from "./ornament";

function slot(name: string) {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

describe("OrnamentRule", () => {
  it("is decorative, gold, and fades both ends by default", () => {
    render(<OrnamentRule className="w-40" />);
    const el = slot("ornament-rule");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("w-40");
    const [left, right] = el.querySelectorAll("span");
    expect(left.className).toContain("text-border-accent");
    expect(left.className).toContain("bg-linear-to-l");
    expect(left.className).not.toContain("from-75%");
    expect(right.className).toContain("bg-linear-to-r");
    expect(el.querySelectorAll("svg")).toHaveLength(1);
  });

  it("fades only the tips of a long divider", () => {
    render(<OrnamentRule fade="tips" />);
    const [left, right] = slot("ornament-rule").querySelectorAll("span");
    expect(left.className).toContain("from-75%");
    expect(left.className).toContain("bg-linear-to-l");
    expect(right.className).toContain("from-75%");
    expect(right.className).toContain("bg-linear-to-r");
  });

  it("frames a label between two gems and stays readable", () => {
    render(
      <OrnamentRule fade="tips">
        <span>Origins</span>
      </OrnamentRule>,
    );
    const el = slot("ornament-rule");
    expect(el.getAttribute("aria-hidden")).toBeNull();
    expect(screen.getByText("Origins")).toBeInTheDocument();
    expect(el.querySelectorAll("svg")).toHaveLength(2);
  });

  it("tints the lines and gem silver without touching the label", () => {
    render(
      <OrnamentRule tone="silver" fade="tips">
        <span>Origins</span>
      </OrnamentRule>,
    );
    const el = slot("ornament-rule");
    expect(el.className).not.toContain("text-muted-foreground");
    expect(el.querySelector("span")?.className).toContain("text-muted-foreground");
    expect(el.querySelector("svg")?.getAttribute("class")).toContain("text-muted-foreground");
  });
});

describe("OrnamentBase", () => {
  it("draws two caps around a medallion holding a gem by default", () => {
    render(<OrnamentBase />);
    const el = slot("ornament-base");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("text-border-accent");
    expect(el.querySelectorAll("svg")).toHaveLength(3);
    expect(el.querySelector(".rounded-full")?.className).toContain("bg-card");
  });

  it("puts a custom icon on a custom plate", () => {
    render(
      <OrnamentBase tone="silver" plateClassName="bg-background">
        <i data-testid="icon" />
      </OrnamentBase>,
    );
    const el = slot("ornament-base");
    expect(el.className).toContain("text-muted-foreground");
    expect(el.querySelector(".rounded-full")?.className).toContain("bg-background");
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(el.querySelectorAll("svg")).toHaveLength(2);
  });

  it("carries the panel surface down to the base line only when asked", () => {
    const { rerender } = render(<OrnamentBase />);
    expect(slot("ornament-surface")).toBeNull();
    rerender(<OrnamentBase surfaceClassName="bg-muted/30" />);
    const surface = slot("ornament-surface");
    expect(surface.className).toContain("bg-muted/30");
    expect(surface.className).toContain("h-2");
    expect(surface.style.clipPath).toContain("polygon");
  });
});

describe("OrnamentCorners", () => {
  it("renders three decorative corners with the wedge in the surface color", () => {
    render(
      <div className="relative">
        <OrnamentCorners wedgeClassName="fill-card" />
      </div>,
    );
    const corners = document.querySelectorAll("svg");
    expect(corners).toHaveLength(3);
    for (const corner of corners) {
      expect(corner.getAttribute("aria-hidden")).toBe("true");
      expect(corner.querySelector("path")?.getAttribute("class")).toBe("fill-card");
    }
  });
});
