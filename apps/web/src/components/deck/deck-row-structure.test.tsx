import type { DeckListItemResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// The router's Link needs a live router, so it stands in as the anchor it
// renders. Everything this file asserts is about the markup around it.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => (
    <a href="/decks/deck-1" {...rest}>
      {children}
    </a>
  ),
}));

// The two menus stand in as the control they are: a button that opens a popup.
// What matters here is where that button sits in the tree, not what it opens.
vi.mock("./deck-actions-menu", () => ({
  DeckActionsMenu: () => <button type="button">Deck actions</button>,
}));
vi.mock("./local-deck-actions-menu", () => ({
  LocalDeckActionsMenu: () => <button type="button">Deck actions</button>,
}));

vi.mock("@/hooks/use-preferred-printing", () => ({
  usePreferredPrinting: () => ({
    getPreferredPrinting: () => undefined,
    getPreferredFrontImage: () => undefined,
  }),
}));
vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));
vi.mock("@/hooks/use-home-collection", () => ({ useHomeCollection: () => undefined }));
vi.mock("@/hooks/use-enums", () => ({
  useCustomTagList: () => ({ all: [] }),
  useDeckFormatList: () => ({ formats: [], labels: {} }),
  useEnumOrders: () => ({ labels: { domains: {} } }),
}));

const { DeckListRow } = await import("./deck-list-row");
const { DeckTile } = await import("./deck-tile");

const ITEM: DeckListItemResponse = {
  deck: {
    id: "deck-1",
    name: "Jinx Fury Aggro",
    descriptionSnippet: "Burn them down before turn six.",
    format: "standard",
    formatConfig: null,
    isPinned: true,
    archivedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    coverCardId: null,
    coverPrintingId: null,
    coverPosition: null,
    collectionId: null,
    familyId: "fam-1",
    predecessorDeckId: null,
    isPrimary: true,
    isDraft: true,
  },
  legendCardId: null,
  championCardId: null,
  totalCards: 40,
  typeCounts: [],
  domainDistribution: [],
  isValid: true,
  requiredProgress: 40,
  requiredTotal: 40,
  totalValueCents: null,
  missingCount: null,
  folderIds: ["f1", "f2", "f3"],
};

const FOLDER_LABELS = { f1: "Brews", f2: "Retired", f3: "Testing" };

const FAMILY = { id: "fam-1", role: "front", memberCount: 3, expanded: false } as const;

// The HTML content model forbids any interactive descendant inside an `<a>`.
function interactiveInsideAnchor(container: HTMLElement): string[] {
  return [...container.querySelectorAll("a")].flatMap((anchor) =>
    [...anchor.querySelectorAll("a, button, input, select, textarea, [tabindex]")].map(
      (node) => `a > ${node.tagName.toLowerCase()}`,
    ),
  );
}

describe.each([
  ["DeckListRow", DeckListRow],
  ["DeckTile", DeckTile],
])("%s", (_name, Row) => {
  function renderRow() {
    return render(
      <Row item={ITEM} folderLabels={FOLDER_LABELS} family={FAMILY} onToggleFamily={vi.fn()} />,
    );
  }

  it("puts no interactive element inside an anchor", () => {
    const { container } = renderRow();

    expect(interactiveInsideAnchor(container)).toEqual([]);
  });

  it("does not make the row root itself the anchor", () => {
    const { container } = renderRow();

    expect(container.firstElementChild?.tagName).not.toBe("A");
  });

  it("links the deck through its name", () => {
    renderRow();

    expect(screen.getByRole("link", { name: "Jinx Fury Aggro" })).toHaveAttribute(
      "href",
      "/decks/deck-1",
    );
  });

  it("stretches that link across the row", () => {
    renderRow();

    expect(screen.getByRole("link", { name: "Jinx Fury Aggro" }).className).toContain(
      "after:inset-0",
    );
  });

  it("keeps the menu reachable", () => {
    renderRow();

    expect(screen.getByRole("button", { name: "Deck actions" })).toBeInTheDocument();
  });
});
