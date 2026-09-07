import type { MetaCrossSourceReview, MetaCrossSourceRow } from "@openrift/shared/types/api/meta";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/admin/meta-standings-row-picker", () => ({
  MetaStandingsRowPicker: () => null,
}));

const captured = {
  review: undefined as MetaCrossSourceReview | undefined,
  isPending: false,
  isError: false,
  links: [] as unknown[],
  unlinks: [] as unknown[],
  contributes: [] as { id: string; contributes: boolean }[],
};

vi.mock("@/hooks/use-admin-meta-overlays", () => ({
  useMetaCrossSourceReview: () => ({
    data: captured.review,
    isPending: captured.isPending,
    isError: captured.isError,
  }),
  useLinkMetaCrossSourcePlayers: () => ({
    mutateAsync: (input: unknown) => {
      captured.links.push(input);
      return Promise.resolve();
    },
    isPending: false,
  }),
  useUnlinkMetaCrossSourcePlayer: () => ({
    mutateAsync: (input: unknown) => {
      captured.unlinks.push(input);
      return Promise.resolve();
    },
    isPending: false,
  }),
  useSetMetaSourceContributes: () => ({
    mutateAsync: (input: { id: string; contributes: boolean }) => {
      captured.contributes.push(input);
      return Promise.resolve();
    },
    isPending: false,
  }),
}));

const { MetaCrossSourcePanel } = await import("@/components/admin/meta-cross-source-panel");

function row(overrides: Partial<MetaCrossSourceRow> = {}): MetaCrossSourceRow {
  return {
    provider: "topdeck",
    sourceIdentity: "ta",
    playerName: "Ashe",
    rank: 1,
    legendName: null,
    hasDeck: false,
    state: "unreviewed",
    metaEventPlayerId: null,
    suggestions: [
      {
        metaEventPlayerId: "live-1",
        playerName: "Ashe",
        rank: 1,
        rankIsTier: false,
        deckId: null,
        score: 11,
        reasons: ["same player", "same finish"],
        isCurrent: false,
        isExact: true,
      },
    ],
    ...overrides,
  };
}

function review(overrides: Partial<MetaCrossSourceReview> = {}): MetaCrossSourceReview {
  return {
    sources: [{ id: "src-td", provider: "topdeck", externalId: "tid-1", contributes: false }],
    rows: [row()],
    ...overrides,
  };
}

function renderPanel() {
  render(<MetaCrossSourcePanel metaEventId="e1" enabled />);
}

beforeEach(() => {
  captured.review = review();
  captured.isPending = false;
  captured.isError = false;
  captured.links = [];
  captured.unlinks = [];
  captured.contributes = [];
});

describe("MetaCrossSourcePanel", () => {
  it("says there is nothing to match when every source is read", () => {
    captured.review = review({
      sources: [{ id: "src-td", provider: "topdeck", externalId: "tid-1", contributes: true }],
      rows: [],
    });
    renderPanel();

    expect(screen.getByText(/nothing to match across/u)).toBeInTheDocument();
  });

  it("prints no counts for a read source, whose entries the review no longer lists", () => {
    captured.review = review({
      sources: [{ id: "src-td", provider: "topdeck", externalId: "tid-1", contributes: true }],
      rows: [],
    });
    renderPanel();

    expect(screen.queryByText(/0 linked/u)).not.toBeInTheDocument();
  });

  it("offers a read source's own switch back, so a decision can be revised", () => {
    captured.review = review({
      sources: [{ id: "src-td", provider: "topdeck", externalId: "tid-1", contributes: true }],
      rows: [],
    });
    renderPanel();

    expect(screen.getByRole("button", { name: "Stop reading this source" })).toBeEnabled();
  });

  it("links one entry to the live row a suggestion names", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Same player" }));

    expect(captured.links).toEqual([
      {
        id: "e1",
        links: [{ provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: "live-1" }],
      },
    ]);
  });

  it("records an entry as its own row", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Not in this event yet" }));

    expect(captured.links).toEqual([
      {
        id: "e1",
        links: [{ provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: null }],
      },
    ]);
  });

  it("sends every exact match in one call", async () => {
    captured.review = review({
      rows: [
        row({ sourceIdentity: "ta" }),
        row({
          sourceIdentity: "tb",
          playerName: "Jinx",
          rank: 2,
          suggestions: [
            {
              metaEventPlayerId: "live-2",
              playerName: "Jinx",
              rank: 2,
              rankIsTier: false,
              deckId: null,
              score: 11,
              reasons: ["same player", "same finish"],
              isCurrent: false,
              isExact: true,
            },
          ],
        }),
      ],
    });
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Link 2 exact matches" }));

    expect(captured.links).toHaveLength(1);
    expect(captured.links[0]).toMatchObject({
      links: [
        { sourceIdentity: "ta", metaEventPlayerId: "live-1" },
        { sourceIdentity: "tb", metaEventPlayerId: "live-2" },
      ],
    });
  });

  it("will not let a source contribute while an entry is undecided", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Let this source contribute" })).toBeDisabled();
  });

  it("turns a settled source on", async () => {
    captured.review = review({
      rows: [row({ state: "linked", metaEventPlayerId: "live-1" })],
    });
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Let this source contribute" }));

    expect(captured.contributes).toEqual([{ id: "src-td", contributes: true }]);
  });

  it("takes one decision back", async () => {
    captured.review = review({
      rows: [row({ state: "distinct" })],
    });
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(captured.unlinks).toEqual([{ id: "e1", provider: "topdeck", sourceIdentity: "ta" }]);
  });
});
