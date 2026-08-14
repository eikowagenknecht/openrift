import type { OverlayBoard } from "@openrift/shared";
import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePresentQueueStore } from "@/stores/present-queue-store";
import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

const PRINTING = stubPrinting({
  images: [{ face: "front", imageId: "img-1" }],
  card: { name: "Garen" },
});

const {
  mockUseOverlayChannel,
  mockUpdateSettings,
  mockPushCard,
  mockPushBoard,
  mockSetReveal,
  mockClear,
} = vi.hoisted(() => ({
  mockUseOverlayChannel: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockPushCard: vi.fn(),
  mockPushBoard: vi.fn(),
  mockSetReveal: vi.fn(),
  mockClear: vi.fn(),
}));

/** The tier list the mocked picker hands over, ranking one catalogued card. */
const TIER_LIST = {
  id: "list-1",
  title: "Origins, ranked",
  tiers: [
    { label: "S", cards: [{ cardId: PRINTING.cardId, printingId: null }] },
    { label: "A", cards: [{ cardId: "gone", printingId: null }] },
  ],
};

const idleMutation = { mutate: vi.fn(), isPending: false };

vi.mock("@/hooks/use-overlay", () => ({
  useOverlayChannel: mockUseOverlayChannel,
  usePushOverlayCard: () => ({ mutate: mockPushCard, isPending: false }),
  usePushOverlayBoard: () => ({ mutate: mockPushBoard, isPending: false }),
  useSetOverlayBoardReveal: () => ({ mutate: mockSetReveal, isPending: false }),
  useClearOverlay: () => ({ mutate: mockClear, isPending: false }),
  useRotateOverlayToken: () => idleMutation,
  useUpdateOverlaySettings: () => ({ mutate: mockUpdateSettings, isPending: false }),
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({
    printingsById: { [PRINTING.id]: PRINTING },
    cardsById: { [PRINTING.cardId]: PRINTING.card },
    printingsByCardId: new Map([[PRINTING.cardId, [PRINTING]]]),
  }),
}));

// The real picker loads the creator's lists through a query client this render
// has none of. What the section owns is what it does with a picked list.
vi.mock("@/components/overlay/overlay-tier-list-picker", () => ({
  OverlayTierListPicker: ({ onPick }: { onPick: (list: typeof TIER_LIST) => void }) => (
    <button type="button" onClick={() => onPick(TIER_LIST)}>
      pick-tier-list
    </button>
  ),
}));

// The presets section reads the creator's saved scenes (and their session)
// through a query client this render has none of. What the panel owns is the
// scene controls, not the list of saved ones.
vi.mock("@/components/overlay/overlay-presets-section", () => ({
  OverlayPresetsSection: () => <div>presets</div>,
}));

// The preview renders the real OverlayFrame, whose plate reaches for enum
// labels and domain colors through a query client this render has none of.
vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ labels: { finishes: {}, cardSizes: {} } }),
}));

vi.mock("@/hooks/use-domain-colors", () => ({
  useDomainColors: () => ({}),
}));

// The real Base UI slider needs pointer capture and layout boxes to produce a
// drag, neither of which jsdom provides.
vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    onValueChange,
    onValueCommitted,
  }: {
    onValueChange?: (value: number[]) => void;
    onValueCommitted?: (value: number[]) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onValueChange?.([35])}>
        drag-move
      </button>
      <button type="button" onClick={() => onValueCommitted?.([35])}>
        drag-end
      </button>
    </div>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { OverlayOutputPanel } from "./overlay-output-panel";

const resetQueue = createStoreResetter(usePresentQueueStore);

/** @returns The card art's height, which is what the size slider drives. */
function cardHeight(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>(".aspect-card")?.style.height;
}

/** Points the mocked channel at whatever is meant to be live. */
function channelShowing(printingId: string | null, board: OverlayBoard | null = null) {
  mockUseOverlayChannel.mockReturnValue({
    data: {
      token: "AbC123XyZ789",
      version: 3,
      updatedAt: "2026-08-14T10:30:00.000Z",
      payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId, board, scale: 70 },
    },
  });
}

/** @returns The picked list as a pushed board, revealed `revealCount` in. */
function liveBoard(revealCount: number): OverlayBoard {
  return {
    title: TIER_LIST.title,
    tiers: TIER_LIST.tiers,
    revealCount,
    direction: "best-first",
  };
}

beforeEach(resetQueue);
afterEach(resetQueue);

describe("OverlayOutputPanel card size", () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset();
    channelShowing(PRINTING.id);
  });

  it("resizes the preview while the thumb is being dragged", () => {
    // Regression: the drafted size lived inside the settings panel, so the
    // preview above it kept the committed size until the thumb was released —
    // which is the one moment the creator is looking at the preview.
    const { container, getByText } = render(<OverlayOutputPanel />);
    expect(cardHeight(container)).toBe("70%");

    fireEvent.click(getByText("drag-move"));

    expect(cardHeight(container)).toBe("35%");
  });

  it("does not write the new size until the thumb is released", () => {
    const { getByText } = render(<OverlayOutputPanel />);

    fireEvent.click(getByText("drag-move"));
    expect(mockUpdateSettings).not.toHaveBeenCalled();

    fireEvent.click(getByText("drag-end"));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ scale: 35 });
  });

  it("falls back to the channel's size once the drag is over", () => {
    const { container, getByText } = render(<OverlayOutputPanel />);

    fireEvent.click(getByText("drag-move"));
    fireEvent.click(getByText("drag-end"));

    // The write is in flight; the preview goes back to what the channel says
    // rather than holding a draft that nothing owns any more.
    expect(cardHeight(container)).toBe("70%");
  });
});

describe("OverlayOutputPanel walk controls", () => {
  const QUEUE = [PRINTING.id, "p-2", "p-3"];

  beforeEach(() => {
    mockPushCard.mockReset();
    // The clicker steps the very queue the builder beside it is editing, so the
    // store is where the run comes from rather than this panel's own state.
    usePresentQueueStore.getState().load(QUEUE);
    channelShowing(PRINTING.id);
  });

  it("steps forward from the live card", () => {
    const { getByText, getByLabelText } = render(<OverlayOutputPanel />);

    expect(getByText("1 / 3")).toBeTruthy();

    fireEvent.click(getByLabelText("Push the next queued card"));

    expect(mockPushCard).toHaveBeenCalledWith({ printingId: "p-2" });
  });

  it("steps back to the card before the live one", () => {
    channelShowing("p-2");
    const { getByText, getByLabelText } = render(<OverlayOutputPanel />);

    expect(getByText("2 / 3")).toBeTruthy();

    fireEvent.click(getByLabelText("Push the previous queued card"));

    expect(mockPushCard).toHaveBeenCalledWith({ printingId: PRINTING.id });
  });

  it("disables the ends rather than wrapping around", () => {
    channelShowing("p-3");
    const { getByText, getByLabelText } = render(<OverlayOutputPanel />);

    expect(getByText("3 / 3")).toBeTruthy();
    expect(getByLabelText("Push the next queued card").hasAttribute("disabled")).toBe(true);
    expect(getByLabelText("Push the previous queued card").hasAttribute("disabled")).toBe(false);
  });

  it("starts the run from the top when nothing is live", () => {
    channelShowing(null);
    const { getByText, getByLabelText } = render(<OverlayOutputPanel />);

    // No position to report yet, so the readout shows a dash rather than a
    // number the next press wouldn't honour.
    expect(getByText("– / 3")).toBeTruthy();
    expect(getByLabelText("Push the previous queued card").hasAttribute("disabled")).toBe(true);

    fireEvent.click(getByLabelText("Push the next queued card"));

    expect(mockPushCard).toHaveBeenCalledWith({ printingId: PRINTING.id });
  });

  it("offers the first queued card while an off-queue search is live", () => {
    channelShowing("off-queue");
    const { getByText, getByLabelText } = render(<OverlayOutputPanel />);

    expect(getByText("– / 3")).toBeTruthy();

    fireEvent.click(getByLabelText("Push the next queued card"));

    expect(mockPushCard).toHaveBeenCalledWith({ printingId: PRINTING.id });
  });

  it("renders no walk controls without a queue", () => {
    usePresentQueueStore.getState().reset();
    const { queryByLabelText } = render(<OverlayOutputPanel />);

    expect(queryByLabelText("Push the next queued card")).toBeNull();
  });
});

describe("OverlayOutputPanel clear", () => {
  beforeEach(() => {
    mockClear.mockReset();
  });

  it("takes whatever is up off stream", () => {
    channelShowing(PRINTING.id);
    const { getByText } = render(<OverlayOutputPanel />);

    fireEvent.click(getByText("Clear"));

    expect(mockClear).toHaveBeenCalled();
  });

  it("stays disabled while the source is already empty", () => {
    channelShowing(null);
    const { getByText } = render(<OverlayOutputPanel />);

    expect(getByText("Clear").closest("button")?.hasAttribute("disabled")).toBe(true);
  });

  it("is live for a board too, not just a card", () => {
    // Regression risk from the merge: the dashboard's Clear only looked at the
    // pushed card, so a ranking on screen left the button dead.
    channelShowing(null, liveBoard(1));
    const { getByText } = render(<OverlayOutputPanel />);

    expect(getByText("Clear").closest("button")?.hasAttribute("disabled")).toBe(false);
  });
});

describe("OverlayOutputPanel tier list section", () => {
  beforeEach(() => {
    mockPushBoard.mockReset();
    mockSetReveal.mockReset();
    mockClear.mockReset();
    channelShowing(null);
  });

  it("pushes nothing until a list is picked", () => {
    const { getByText } = render(<OverlayOutputPanel />);

    expect(getByText("Show whole board").hasAttribute("disabled")).toBe(true);
    expect(getByText("Start reveal").hasAttribute("disabled")).toBe(true);
  });

  it("pushes the whole board, revealed to the end", () => {
    const { getByText } = render(<OverlayOutputPanel />);

    fireEvent.click(getByText("pick-tier-list"));
    fireEvent.click(getByText("Show whole board"));

    expect(mockPushBoard).toHaveBeenCalledWith({
      board: {
        title: "Origins, ranked",
        tiers: TIER_LIST.tiers,
        revealCount: 2,
        direction: "best-first",
      },
    });
  });

  it("starts a reveal at nothing revealed, in the chosen direction", () => {
    const { getByText } = render(<OverlayOutputPanel />);

    fireEvent.click(getByText("pick-tier-list"));
    fireEvent.click(getByText("Start at the bottom"));
    fireEvent.click(getByText("Start reveal"));

    expect(mockPushBoard).toHaveBeenCalledWith({
      board: expect.objectContaining({ revealCount: 0, direction: "worst-first" }),
    });
  });

  it("steps the reveal forward and back, counting only cards it can draw", () => {
    // The list ranks two cards but the catalogue only has one, so the run is
    // one step long — a step that could never be reached would strand the
    // creator on a Next button that does nothing.
    channelShowing(null, liveBoard(0));
    const { getByText, getByLabelText } = render(<OverlayOutputPanel />);

    expect(getByText("0 / 1")).toBeTruthy();
    expect(
      getByLabelText("Take the last revealed card back off the board").hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(getByLabelText("Reveal the next card on the board"));

    expect(mockSetReveal).toHaveBeenCalledWith({ revealCount: 1 });
  });

  it("holds the readout inside the board when the whole thing is up", () => {
    // Pushed with every stored entry revealed, including the one the catalogue
    // dropped: the readout still has to read as finished rather than `2 / 1`.
    channelShowing(null, liveBoard(2));
    const { getByText, getByLabelText } = render(<OverlayOutputPanel />);

    expect(getByText("1 / 1")).toBeTruthy();
    expect(getByLabelText("Reveal the next card on the board").hasAttribute("disabled")).toBe(true);

    fireEvent.click(getByLabelText("Take the last revealed card back off the board"));

    expect(mockSetReveal).toHaveBeenCalledWith({ revealCount: 0 });
  });

  it("offers no reveal controls until a board is on stream", () => {
    const { queryByLabelText, queryByText } = render(<OverlayOutputPanel />);

    expect(queryByLabelText("Reveal the next card on the board")).toBeNull();
    expect(queryByText("Hide")).toBeNull();
  });

  it("takes the board down with Hide", () => {
    channelShowing(null, liveBoard(1));
    const { getByText } = render(<OverlayOutputPanel />);

    fireEvent.click(getByText("Hide"));

    expect(mockClear).toHaveBeenCalled();
  });

  it("names the board on stream in the preview", () => {
    channelShowing(null, liveBoard(1));
    const { getAllByText } = render(<OverlayOutputPanel />);

    // Once as the preview's caption, once as the board panel's own title.
    expect(getAllByText("Origins, ranked").length).toBeGreaterThan(1);
  });
});
