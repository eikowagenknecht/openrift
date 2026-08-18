import type { MetaDeckMatchSuggestion } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  suggestions: [] as MetaDeckMatchSuggestion[],
  isPending: false,
  link: vi.fn(),
}));

vi.mock("@/hooks/use-admin-meta-candidates", () => ({
  useLinkMetaCandidateDeck: () => ({ mutateAsync: captured.link, isPending: false }),
  useMetaDeckMatchSuggestions: () => ({
    data: { suggestions: captured.suggestions },
    isPending: captured.isPending,
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaDeckSuggestions } from "./meta-deck-suggestions";

const suggestion: MetaDeckMatchSuggestion = {
  deckId: "live-1",
  name: "Yasuo Aggro",
  playerName: "Ana Lee",
  finishTier: 1,
  score: 9,
  reasons: ["Pilot name overlap", "Same finish"],
};

describe("MetaDeckSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.suggestions = [];
    captured.isPending = false;
  });

  it("lists the archived decks the pilot might be, with their reasons", () => {
    captured.suggestions = [suggestion];
    render(<MetaDeckSuggestions candidateDeckId="cand-deck-1" playerName="A. Lee" />);
    expect(screen.getByText("Ana Lee")).toBeInTheDocument();
    expect(screen.getByText("Pilot name overlap")).toBeInTheDocument();
  });

  it("links nothing on render", () => {
    captured.suggestions = [suggestion];
    render(<MetaDeckSuggestions candidateDeckId="cand-deck-1" playerName="A. Lee" />);
    expect(captured.link).not.toHaveBeenCalled();
  });

  it("links only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    captured.suggestions = [suggestion];
    render(<MetaDeckSuggestions candidateDeckId="cand-deck-1" playerName="A. Lee" />);

    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(captured.link).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Link" }));
    expect(captured.link).toHaveBeenCalledWith({ id: "cand-deck-1", deckId: "live-1" });
  });

  it("says so when no archived deck matches the pilot", () => {
    render(<MetaDeckSuggestions candidateDeckId="cand-deck-1" playerName="A. Lee" />);
    expect(
      screen.getByText("No archived deck in this event carries a matching pilot name."),
    ).toBeInTheDocument();
  });
});
