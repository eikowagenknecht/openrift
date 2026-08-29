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

  it("renders bullet and numbered lists with their markers", () => {
    const { container } = render(<MarkdownText text={"- one\n- two\n\n1. first\n2. second"} />);
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    // Tailwind's preflight drops list markers and indentation, so the wrapper
    // has to put them back — without these the items render as bare lines.
    const wrapper = container.firstElementChild?.className ?? "";
    expect(wrapper).toContain("[&_ul]:list-disc");
    expect(wrapper).toContain("[&_ol]:list-decimal");
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

  describe("when links are unrestricted", () => {
    it("renders links to hosts outside the allowlist", () => {
      render(<MarkdownText text="See [the wiki](https://example.com) for details." links="any" />);
      const link = screen.getByRole("link", { name: "the wiki" });
      expect(link).toHaveAttribute("href", "https://example.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel") ?? "").toContain("noreferrer");
    });

    it("still drops javascript: URLs", () => {
      render(<MarkdownText text="Click [me](javascript:alert(1)) now." links="any" />);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText("me")).toBeInTheDocument();
    });

    it("still strips raw HTML", () => {
      const { container } = render(
        <MarkdownText text='<img src="x" onerror="alert(1)" />hello' links="any" />,
      );
      expect(container.querySelector("img")).toBeNull();
      expect(screen.getByText(/hello/u)).toBeInTheDocument();
    });
  });

  describe("when links are labeled", () => {
    it("names the destination host after a link that hides it", () => {
      render(<MarkdownText text="Meet at [the shop](https://example.com)." links="labeled" />);
      expect(screen.getByRole("link", { name: "the shop" })).toHaveAttribute(
        "href",
        "https://example.com",
      );
      expect(screen.getByText("(example.com)")).toBeInTheDocument();
    });

    it("stays quiet when the link text already names the host", () => {
      render(
        <MarkdownText
          text="Meet at [example.com/shop](https://example.com/shop)."
          links="labeled"
        />,
      );
      expect(screen.queryByText(/\(example\.com\)/u)).toBeNull();
    });

    it("ignores a www. prefix on either side", () => {
      render(
        <MarkdownText text="Read [www.example.com](https://example.com) now." links="labeled" />,
      );
      expect(screen.queryByText(/\(example\.com\)/u)).toBeNull();
    });

    it("names the host when the text only looks like a subdomain of it", () => {
      render(
        <MarkdownText text="Go to [evil.example.com](https://evil.example)." links="labeled" />,
      );
      expect(screen.getByText("(evil.example)")).toBeInTheDocument();
    });

    it("leaves relative links unlabeled", () => {
      render(<MarkdownText text="See [the rules](/rules) here." links="labeled" />);
      expect(screen.getByRole("link", { name: "the rules" })).toHaveAttribute("href", "/rules");
      expect(screen.queryByText(/\(/u)).toBeNull();
    });
  });

  describe("with headings", () => {
    it("renders h1-h3 when enabled", () => {
      const { container } = render(
        <MarkdownText text={"# Strategy\n\n### Mulligans\n\nBody."} headings />,
      );
      expect(container.querySelector("h1")).toHaveTextContent("Strategy");
      expect(container.querySelector("h3")).toHaveTextContent("Mulligans");
    });
  });

  describe("with renderCardLink", () => {
    it("routes [[Card Name]] spans through the callback", () => {
      render(
        <MarkdownText
          text="Open with [[Shadow Assault]] when ahead."
          renderCardLink={(name, children) => (
            <span data-testid="card-link" data-name={name}>
              {children}
            </span>
          )}
        />,
      );
      const link = screen.getByTestId("card-link");
      expect(link).toHaveAttribute("data-name", "Shadow Assault");
      expect(link).toHaveTextContent("Shadow Assault");
    });

    it("keeps card names with special characters intact", () => {
      render(
        <MarkdownText
          text="Try [[Kai'Sa, Daughter of the Void (Promo)]] too."
          renderCardLink={(name, children) => (
            <span data-testid="card-link" data-name={name}>
              {children}
            </span>
          )}
        />,
      );
      expect(screen.getByTestId("card-link")).toHaveAttribute(
        "data-name",
        "Kai'Sa, Daughter of the Void (Promo)",
      );
    });

    it("leaves [[...]] literal without the callback", () => {
      render(<MarkdownText text="Open with [[Shadow Assault]] when ahead." />);
      expect(screen.getByText(/\[\[Shadow Assault\]\]/u)).toBeInTheDocument();
    });

    it("does not treat card hrefs as external links", () => {
      render(
        <MarkdownText
          text="[[Shadow Assault]]"
          renderCardLink={(_name, children) => <span data-testid="card-link">{children}</span>}
        />,
      );
      expect(screen.queryByRole("link")).toBeNull();
    });
  });
});
