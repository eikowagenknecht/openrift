import type { CandidateCardSummaryResponse } from "@openrift/shared/types/api/admin";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/features/admin/components/assign-button", () => ({
  AssignButton: ({ normalizedName }: { normalizedName: string }) => (
    <button type="button" data-normalized={normalizedName}>
      Assign
    </button>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import type { CardNameCellMeta } from "./card-name-cell";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardNameCell } from "./card-name-cell";

function makeRow(overrides: Partial<CandidateCardSummaryResponse> = {}) {
  return {
    cardSlug: null,
    name: "New Card",
    normalizedName: "newcard",
    shortCodes: [],
    stagingShortCodes: [],
    setSlugs: [],
    candidateCount: 1,
    uncheckedCardCount: 0,
    uncheckedPrintingCount: 0,
    unlinkedPrintingCount: 0,
    hasFavorite: false,
    favoriteStagingShortCodes: [],
    suggestedCardSlug: null,
    hasUserSubmission: false,
    ...overrides,
  } as CandidateCardSummaryResponse;
}

function makeMeta(overrides: Partial<CardNameCellMeta> = {}): CardNameCellMeta {
  return {
    linkCard: { mutate: vi.fn(), isPending: false },
    acceptFavorite: { mutate: vi.fn(), isPending: false },
    allCards: [],
    isAdmin: true,
    ...overrides,
  } as unknown as CardNameCellMeta;
}

describe("CardNameCell", () => {
  it("links an unmatched row to the new-card route by normalized name", () => {
    render(<CardNameCell row={makeRow()} meta={makeMeta()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/cards/new/newcard");
  });

  it("links a matched row to the card detail route", () => {
    render(<CardNameCell row={makeRow({ cardSlug: "fireball" })} meta={makeMeta()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/cards/fireball");
  });

  it("keeps a non-Latin name linkable", () => {
    render(
      <CardNameCell
        row={makeRow({ name: "影流之主", normalizedName: "影流之主" })}
        meta={makeMeta()}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/cards/new/影流之主");
  });

  describe("when the name normalizes to nothing", () => {
    const emptyRow = makeRow({
      name: "!?!",
      normalizedName: "",
      hasFavorite: true,
      suggestedCardSlug: "some-card",
    });

    it("renders the name as text instead of a link", () => {
      render(<CardNameCell row={emptyRow} meta={makeMeta()} />);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText("!?!")).toBeInTheDocument();
    });

    it("never produces a route with an empty path param", () => {
      const { container } = render(<CardNameCell row={emptyRow} meta={makeMeta()} />);
      for (const anchor of container.querySelectorAll("a")) {
        expect(anchor.getAttribute("href")).not.toMatch(/\/admin\/cards\/new\/?$/u);
      }
    });

    it("suppresses the accept, link-suggestion and assign controls", () => {
      render(<CardNameCell row={emptyRow} meta={makeMeta()} />);
      expect(screen.queryByText("Accept")).toBeNull();
      expect(screen.queryByText("some-card")).toBeNull();
      expect(screen.queryByText("Assign")).toBeNull();
    });

    it("still shows those controls when a key exists", () => {
      render(
        <CardNameCell
          row={makeRow({ hasFavorite: true, suggestedCardSlug: "some-card" })}
          meta={makeMeta()}
        />,
      );
      expect(screen.getByText("Accept")).toBeInTheDocument();
      expect(screen.getByText("some-card")).toBeInTheDocument();
      expect(screen.getByText("Assign")).toBeInTheDocument();
    });
  });
});
