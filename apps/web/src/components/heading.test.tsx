import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Eyebrow, Heading } from "./heading";

describe("Heading", () => {
  it("defaults to h2 with section typography when no level is given", () => {
    render(<Heading>Filters</Heading>);
    const heading = screen.getByRole("heading", { level: 2, name: "Filters" });
    expect(heading.tagName).toBe("H2");
    expect(heading.className).toContain("text-lg");
    expect(heading.className).toContain("font-semibold");
  });

  it("renders an h1 with page-title typography for level 1", () => {
    render(<Heading level={1}>Card Sets</Heading>);
    const heading = screen.getByRole("heading", { level: 1, name: "Card Sets" });
    expect(heading.tagName).toBe("H1");
    expect(heading.className).toContain("text-2xl");
    expect(heading.className).toContain("font-bold");
  });

  it("renders an h3 with subsection typography for level 3", () => {
    render(<Heading level={3}>Card title</Heading>);
    const heading = screen.getByRole("heading", { level: 3, name: "Card title" });
    expect(heading.tagName).toBe("H3");
    expect(heading.className).toContain("text-base");
    expect(heading.className).toContain("font-medium");
  });

  it("uses the `as` tag while keeping the level's typography", () => {
    render(
      <Heading level={2} as="h3">
        Sub block
      </Heading>,
    );
    const heading = screen.getByRole("heading", { level: 3, name: "Sub block" });
    expect(heading.tagName).toBe("H3");
    expect(heading.className).toContain("text-lg");
    expect(heading.className).toContain("font-semibold");
  });

  it("merges user-provided className with the level styles", () => {
    render(
      <Heading level={1} className="truncate">
        Long title
      </Heading>,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toContain("text-2xl");
    expect(heading.className).toContain("truncate");
  });

  it("forwards arbitrary attributes (id, aria, data-*) to the rendered tag", () => {
    render(
      <Heading level={2} id="filters-heading" aria-label="Filter section" data-testid="h">
        Filters
      </Heading>,
    );
    const heading = screen.getByTestId("h");
    expect(heading).toHaveAttribute("id", "filters-heading");
    expect(heading).toHaveAttribute("aria-label", "Filter section");
  });
});

describe("Eyebrow", () => {
  it("renders an h4 with the muted uppercase eyebrow styles", () => {
    render(<Eyebrow>Details</Eyebrow>);
    const heading = screen.getByRole("heading", { level: 4, name: "Details" });
    expect(heading.tagName).toBe("H4");
    expect(heading.className).toContain("uppercase");
    expect(heading.className).toContain("tracking-wide");
    expect(heading.className).toContain("text-muted-foreground");
  });

  it("merges user className with default styles", () => {
    render(<Eyebrow className="mb-0">Details</Eyebrow>);
    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading.className).toContain("uppercase");
    expect(heading.className).toContain("mb-0");
  });
});
