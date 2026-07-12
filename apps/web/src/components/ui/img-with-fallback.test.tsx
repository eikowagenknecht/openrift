import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImgWithFallback } from "./img-with-fallback";

describe("ImgWithFallback", () => {
  it("renders the image until it errors, then the fallback", () => {
    const { container } = render(
      <ImgWithFallback
        src="/media/cards/aa/broken-400w.webp"
        alt="Broken Card"
        fallback={<div data-testid="fallback" />}
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();

    if (!img) {
      throw new Error("img not found");
    }
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull();
  });

  it("renders nothing after an error when the fallback is null", () => {
    const { container } = render(
      <ImgWithFallback src="/media/cards/aa/broken-400w.webp" alt="" fallback={null} />,
    );
    const img = container.querySelector("img");
    if (!img) {
      throw new Error("img not found");
    }
    fireEvent.error(img);
    expect(container.firstChild).toBeNull();
  });

  it("retries a new src after a previous one failed", () => {
    const { container, rerender } = render(
      <ImgWithFallback src="/media/a.webp" alt="" fallback={null} />,
    );
    const img = container.querySelector("img");
    if (!img) {
      throw new Error("img not found");
    }
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();

    rerender(<ImgWithFallback src="/media/b.webp" alt="" fallback={null} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/media/b.webp");
  });
});
