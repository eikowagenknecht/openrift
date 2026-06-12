import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SectionHeader,
  SectionHeaderActions,
  SectionHeaderDescription,
  SectionHeaderGroup,
  SectionHeaderTitle,
} from "./section-header";

describe("SectionHeader", () => {
  it("renders title and actions side by side", () => {
    render(
      <SectionHeader>
        <SectionHeaderTitle>My section</SectionHeaderTitle>
        <SectionHeaderActions>
          <button type="button">Action</button>
        </SectionHeaderActions>
      </SectionHeader>,
    );
    expect(screen.getByRole("heading", { name: "My section" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });

  it("renders title with description inside a group, actions on the right", () => {
    render(
      <SectionHeader>
        <SectionHeaderGroup>
          <SectionHeaderTitle>Section title</SectionHeaderTitle>
          <SectionHeaderDescription>Some description text</SectionHeaderDescription>
        </SectionHeaderGroup>
        <SectionHeaderActions>
          <button type="button">Save</button>
        </SectionHeaderActions>
      </SectionHeader>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Section title" });
    expect(heading.className).toContain("text-lg");
    expect(screen.getByText("Some description text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("forwards the title's `as` tag", () => {
    render(
      <SectionHeader>
        <SectionHeaderTitle level={2} as="h3">
          Sub
        </SectionHeaderTitle>
      </SectionHeader>,
    );
    const heading = screen.getByRole("heading", { level: 3, name: "Sub" });
    expect(heading.tagName).toBe("H3");
    expect(heading.className).toContain("text-lg");
  });

  it("merges user className with default container styles", () => {
    render(
      <SectionHeader className="mb-6" data-testid="header">
        <SectionHeaderTitle>X</SectionHeaderTitle>
      </SectionHeader>,
    );
    const container = screen.getByTestId("header");
    expect(container.className).toContain("flex");
    expect(container.className).toContain("justify-between");
    expect(container.className).toContain("mb-6");
  });
});
