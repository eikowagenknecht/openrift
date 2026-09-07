import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubDeckBuilderCard } from "@/test/factories";

const { exportMock, encodeMock, deckCardsMock } = vi.hoisted(() => ({
  exportMock: vi.fn(),
  encodeMock: vi.fn(),
  deckCardsMock: vi.fn(),
}));

function stubMutation(mutate: ReturnType<typeof vi.fn>) {
  return {
    mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    variables: undefined,
  };
}

vi.mock("@/features/decks/hooks/use-decks", () => ({
  useExportDeck: () => stubMutation(exportMock),
  useEncodeDeckCards: () => stubMutation(encodeMock),
}));

vi.mock("@/features/decks/hooks/use-deck-builder", () => ({
  useDeckCards: (deckId: string) => deckCardsMock(deckId),
}));

vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn(), reset: vi.fn() }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { DeckExportDialog } from "./deck-export-dialog";

const cards = [stubDeckBuilderCard({ cardId: "card-1", cardName: "Yasuo", quantity: 3 })];

describe("DeckExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deckCardsMock.mockReturnValue([]);
  });

  it("exports a server deck through the owner endpoint", async () => {
    render(<DeckExportDialog deckId="deck-1" isDirty={false} open onOpenChange={vi.fn()} />);
    await screen.findByRole("dialog");

    expect(exportMock).toHaveBeenCalledWith(
      { deckId: "deck-1", format: "text" },
      expect.anything(),
    );
    expect(encodeMock).not.toHaveBeenCalled();
  });

  it("encodes a public deck's cards instead of exporting a row the viewer can't read", async () => {
    render(
      <DeckExportDialog
        deckId="deck-1"
        isDirty={false}
        open
        onOpenChange={vi.fn()}
        cards={cards}
        publicSource={{ shareToken: "tok123", imageVersion: 42 }}
      />,
    );
    await screen.findByRole("dialog");

    expect(exportMock).not.toHaveBeenCalled();
    expect(encodeMock).toHaveBeenCalledWith(
      {
        format: "text",
        cards: [expect.objectContaining({ cardId: "card-1", quantity: 3 })],
      },
      expect.anything(),
    );
  });

  it("never subscribes the editor draft when the caller brings its own cards", async () => {
    render(
      <DeckExportDialog
        deckId="deck-1"
        isDirty={false}
        open
        onOpenChange={vi.fn()}
        cards={cards}
        publicSource={{ shareToken: "tok123", imageVersion: 42 }}
      />,
    );
    await screen.findByRole("dialog");

    expect(deckCardsMock).toHaveBeenCalledWith("");
    expect(deckCardsMock).not.toHaveBeenCalledWith("deck-1");
  });
});
