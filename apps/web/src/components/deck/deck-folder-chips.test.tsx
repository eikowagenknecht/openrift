import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeckFolderChips } from "./deck-folder-chips";

const LABELS = {
  f1: "Standard Brews",
  f2: "Jank",
  f3: "Retired",
  f4: "Testing",
};

describe("DeckFolderChips", () => {
  it("renders a chip per folder", () => {
    render(<DeckFolderChips folderIds={["f1", "f2"]} folderLabels={LABELS} />);
    expect(screen.getByText("Standard Brews")).toBeInTheDocument();
    expect(screen.getByText("Jank")).toBeInTheDocument();
  });

  it("renders nothing for an unfiled deck", () => {
    const { container } = render(<DeckFolderChips folderIds={[]} folderLabels={LABELS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("collapses everything past the second folder into a +N", () => {
    render(<DeckFolderChips folderIds={["f1", "f2", "f3", "f4"]} folderLabels={LABELS} />);
    expect(screen.getByText("Standard Brews")).toBeInTheDocument();
    expect(screen.getByText("Jank")).toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("shows no overflow chip at exactly two folders", () => {
    render(<DeckFolderChips folderIds={["f1", "f2"]} folderLabels={LABELS} />);
    expect(screen.queryByText(/^\+/u)).not.toBeInTheDocument();
  });

  it("drops ids with no known label rather than showing the raw id", () => {
    render(<DeckFolderChips folderIds={["f1", "gone"]} folderLabels={LABELS} />);
    expect(screen.getByText("Standard Brews")).toBeInTheDocument();
    expect(screen.queryByText("gone")).not.toBeInTheDocument();
  });

  it("renders nothing when every id is unknown", () => {
    const { container } = render(
      <DeckFolderChips folderIds={["gone", "alsogone"]} folderLabels={LABELS} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
