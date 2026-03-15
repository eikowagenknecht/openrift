import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardIcon } from "./card-icon";

describe("CardIcon", () => {
  it("renders an SVG as a masked span", () => {
    render(<CardIcon src="/icons/fire.svg" />);
    const el = document.querySelector("span");
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ maskImage: "url(/icons/fire.svg)" });
  });

  it("renders a non-SVG as an img element", () => {
    render(<CardIcon src="/icons/fire.png" />);
    const img = screen.getByRole("presentation");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/icons/fire.png");
  });

  it("applies custom className to SVG variant", () => {
    render(<CardIcon src="/icons/fire.svg" className="size-6" />);
    const el = document.querySelector("span");
    expect(el).toHaveClass("size-6");
  });

  it("applies custom className to img variant", () => {
    render(<CardIcon src="/icons/fire.png" className="size-6" />);
    const img = screen.getByRole("presentation");
    expect(img).toHaveClass("size-6");
  });

  it("uses default size when no className is provided", () => {
    render(<CardIcon src="/icons/fire.svg" />);
    const el = document.querySelector("span");
    expect(el).toHaveClass("size-3.5");
  });
});
