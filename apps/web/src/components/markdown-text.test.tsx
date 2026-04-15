import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownText } from "./markdown-text";

describe("MarkdownText", () => {
  it("renders a plain sentence", () => {
    render(<MarkdownText text="Just words." />);
    expect(screen.getByText("Just words.")).toBeInTheDocument();
  });

  it("renders markdown links with safe attributes", () => {
    render(<MarkdownText text="See [the wiki](https://example.com) for details." />);
    const link = screen.getByRole("link", { name: "the wiki" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("renders inline emphasis and strong", () => {
    const { container } = render(<MarkdownText text="An *emphasized* and **strong** note." />);
    expect(container.querySelector("em")).toHaveTextContent("emphasized");
    expect(container.querySelector("strong")).toHaveTextContent("strong");
  });

  it("strips disallowed block elements while keeping text", () => {
    const { container } = render(<MarkdownText text={"# Heading\n\nBody text."} />);
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.getByText(/Heading/)).toBeInTheDocument();
    expect(screen.getByText("Body text.")).toBeInTheDocument();
  });

  it("does not render raw HTML", () => {
    const { container } = render(<MarkdownText text='<img src="x" onerror="alert(1)" />hello' />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });
});
