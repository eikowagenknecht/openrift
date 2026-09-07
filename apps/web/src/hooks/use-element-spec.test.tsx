import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ElementSpec } from "./use-element-spec";
import {
  formatSpecLine,
  isTransparentColor,
  readElementSpec,
  useElementSpec,
} from "./use-element-spec";

function makeSpec(overrides: Partial<ElementSpec>): ElementSpec {
  return {
    width: 32,
    height: 32,
    radius: "6px",
    cornerCut: false,
    fontSize: "14px",
    background: "rgb(0, 0, 0)",
    color: "rgb(255, 255, 255)",
    hasText: true,
    ...overrides,
  };
}

describe("isTransparentColor", () => {
  it("treats empty and keyword transparent as transparent", () => {
    expect(isTransparentColor("")).toBe(true);
    expect(isTransparentColor("transparent")).toBe(true);
  });

  it("detects zero alpha in rgba and oklch", () => {
    expect(isTransparentColor("rgba(0, 0, 0, 0)")).toBe(true);
    expect(isTransparentColor("oklch(0.5 0.1 80 / 0)")).toBe(true);
    expect(isTransparentColor("color(srgb 0 0 0 / 0%)")).toBe(true);
  });

  it("keeps opaque colors, including a zero last channel without alpha", () => {
    expect(isTransparentColor("rgb(255, 0, 0)")).toBe(false);
    expect(isTransparentColor("oklch(0.38 0.05 195)")).toBe(false);
    expect(isTransparentColor("rgba(0, 0, 0, 0.5)")).toBe(false);
  });

  it("rejects non-functional values it cannot parse", () => {
    expect(isTransparentColor("currentcolor")).toBe(false);
  });
});

describe("formatSpecLine", () => {
  it("shows both dimensions for square elements", () => {
    expect(formatSpecLine(makeSpec({ hasText: false }))).toBe("32×32 · r 6");
  });

  it("shows height only for content-sized elements", () => {
    expect(formatSpecLine(makeSpec({ width: 87.4 }))).toBe("h 32 · r 6 · text 14");
  });

  it("labels clipped elements as corner-cut instead of a radius", () => {
    expect(formatSpecLine(makeSpec({ width: 90, radius: "0px", cornerCut: true }))).toBe(
      "h 32 · corner-cut · text 14",
    );
  });

  it("collapses huge radii to full and keeps percentages verbatim", () => {
    expect(formatSpecLine(makeSpec({ radius: "9999px", hasText: false }))).toBe("32×32 · r full");
    expect(formatSpecLine(makeSpec({ radius: "50%", hasText: false }))).toBe("32×32 · r 50%");
  });

  it("omits unparseable radius and font size", () => {
    expect(formatSpecLine(makeSpec({ width: 90, radius: "", fontSize: "" }))).toBe("h 32");
  });

  it("rounds fractional measurements to one decimal", () => {
    expect(formatSpecLine(makeSpec({ width: 28.348, height: 28.352, hasText: false }))).toBe(
      "h 28.4 · r 6",
    );
  });
});

describe("readElementSpec", () => {
  it("reads box, radius, and text presence from a live element", () => {
    const element = document.createElement("div");
    element.style.borderRadius = "8px";
    element.textContent = "hello";
    document.body.append(element);
    const spec = readElementSpec(element);
    expect(spec.radius).toBe("8px");
    expect(spec.hasText).toBe(true);
    expect(typeof spec.width).toBe("number");
    expect(typeof spec.height).toBe("number");
    element.remove();
  });

  it("flags empty elements as having no text", () => {
    const element = document.createElement("div");
    document.body.append(element);
    expect(readElementSpec(element).hasText).toBe(false);
    element.remove();
  });
});

function Probe() {
  const { ref, spec } = useElementSpec<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="wrapper" data-measured={spec === null ? "no" : "yes"}>
      <span>sample</span>
    </div>
  );
}

function EmptyProbe() {
  const { ref, spec } = useElementSpec<HTMLDivElement>();
  return <div ref={ref} data-testid="empty" data-measured={spec === null ? "no" : "yes"} />;
}

describe("useElementSpec", () => {
  it("measures the first element child after mount", async () => {
    const { getByTestId } = render(<Probe />);
    await waitFor(() => {
      expect(getByTestId("wrapper").dataset.measured).toBe("yes");
    });
  });

  it("stays null when the wrapper has no element child", () => {
    // render() flushes mount effects via act; measure() has already run.
    const { getByTestId } = render(<EmptyProbe />);
    expect(getByTestId("empty").dataset.measured).toBe("no");
  });
});
