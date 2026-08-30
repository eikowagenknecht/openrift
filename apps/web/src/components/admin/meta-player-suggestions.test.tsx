import type { MetaPlayerMatchSuggestion } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  suggestions: [] as MetaPlayerMatchSuggestion[],
  isPending: false,
  link: vi.fn(),
}));

vi.mock("@/hooks/use-admin-meta-candidates", () => ({
  useLinkMetaCandidatePlayer: () => ({ mutateAsync: captured.link, isPending: false }),
  useMetaPlayerMatchSuggestions: () => ({
    data: { suggestions: captured.suggestions },
    isPending: captured.isPending,
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaPlayerSuggestions } from "./meta-player-suggestions";

const suggestion: MetaPlayerMatchSuggestion = {
  metaEventPlayerId: "live-1",
  playerName: "Ana Lee",
  rank: 1,
  rankIsTier: false,
  deckId: null,
  score: 9,
  reasons: ["Player name overlap", "Same finish"],
};

describe("MetaPlayerSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.suggestions = [];
    captured.isPending = false;
  });

  it("lists the archived players the row might be, with their reasons", () => {
    captured.suggestions = [suggestion];
    render(<MetaPlayerSuggestions candidatePlayerId="cand-1" playerName="A. Lee" />);
    expect(screen.getByText("Ana Lee")).toBeInTheDocument();
    expect(screen.getByText("Player name overlap")).toBeInTheDocument();
  });

  it("says which suggestions already carry a list", () => {
    captured.suggestions = [{ ...suggestion, deckId: "deck-1" }];
    render(<MetaPlayerSuggestions candidatePlayerId="cand-1" playerName="A. Lee" />);
    expect(screen.getByText(/has a list/u)).toBeInTheDocument();
  });

  it("links nothing on render", () => {
    captured.suggestions = [suggestion];
    render(<MetaPlayerSuggestions candidatePlayerId="cand-1" playerName="A. Lee" />);
    expect(captured.link).not.toHaveBeenCalled();
  });

  it("links only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    captured.suggestions = [suggestion];
    render(<MetaPlayerSuggestions candidatePlayerId="cand-1" playerName="A. Lee" />);

    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(captured.link).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Link" }));
    expect(captured.link).toHaveBeenCalledWith({
      id: "cand-1",
      metaEventPlayerId: "live-1",
    });
  });

  it("says so when no archived player matches the row", () => {
    render(<MetaPlayerSuggestions candidatePlayerId="cand-1" playerName="A. Lee" />);
    expect(
      screen.getByText("No archived standings row in this event carries a matching player name."),
    ).toBeInTheDocument();
  });
});
