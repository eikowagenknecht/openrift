import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownText } from "./markdown-text";

describe("MarkdownText", () => {
  it("renders a plain sentence", () => {
    render(<MarkdownText text="Just words." />);
    expect(screen.getByText("Just words.")).toBeInTheDocument();
  });

  it("renders allowlisted links with safe attributes", () => {
    render(
      <MarkdownText text="Watch [the breakdown](https://www.youtube.com/watch?v=abc) here." />,
    );
    const link = screen.getByRole("link", { name: "the breakdown" });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc");
    expect(link).toHaveAttribute("target", "_blank");
    const rel = link.getAttribute("rel") ?? "";
    expect(rel).toContain("noreferrer");
    expect(rel).toContain("nofollow");
    expect(rel).toContain("ugc");
  });

  it("renders other allowlisted hosts as links", () => {
    render(<MarkdownText text="See [decks](https://riftdecks.com/abc) and more." />);
    expect(screen.getByRole("link", { name: "decks" })).toHaveAttribute(
      "href",
      "https://riftdecks.com/abc",
    );
  });

  it("strips href from links to disallowed hosts but keeps the text", () => {
    render(<MarkdownText text="See [the wiki](https://example.com) for details." />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("the wiki")).toBeInTheDocument();
  });

  it("drops javascript: URLs entirely", () => {
    render(<MarkdownText text="Click [me](javascript:alert(1)) now." />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("me")).toBeInTheDocument();
  });

  it("renders inline emphasis and strong", () => {
    const { container } = render(<MarkdownText text="An *emphasized* and **strong** note." />);
    expect(container.querySelector("em")).toHaveTextContent("emphasized");
    expect(container.querySelector("strong")).toHaveTextContent("strong");
  });

  it("strips disallowed block elements while keeping text", () => {
    const { container } = render(<MarkdownText text={"# Heading\n\nBody text."} />);
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.getByText(/Heading/u)).toBeInTheDocument();
    expect(screen.getByText("Body text.")).toBeInTheDocument();
  });

  it("does not render raw HTML", () => {
    const { container } = render(<MarkdownText text='<img src="x" onerror="alert(1)" />hello' />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/hello/u)).toBeInTheDocument();
  });

  describe("when trusted", () => {
    it("renders links to hosts outside the allowlist", () => {
      render(<MarkdownText text="See [the wiki](https://example.com) for details." trusted />);
      const link = screen.getByRole("link", { name: "the wiki" });
      expect(link).toHaveAttribute("href", "https://example.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel") ?? "").toContain("noreferrer");
    });

    it("still strips raw HTML", () => {
      const { container } = render(
        <MarkdownText text='<img src="x" onerror="alert(1)" />hello' trusted />,
      );
      expect(container.querySelector("img")).toBeNull();
      expect(screen.getByText(/hello/u)).toBeInTheDocument();
    });
  });
});
