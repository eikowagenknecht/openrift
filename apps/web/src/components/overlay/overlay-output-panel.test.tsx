import type { OverlayBoard } from "@openrift/shared";
import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePresentQueueStore } from "@/stores/present-queue-store";
import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

const PRINTING = stubPrinting({
  images: [{ face: "front", imageId: "img-1" }],
  card: { name: "Garen" },
});

const { mockUseOverlayChannel, mockUpdateSettings, mockPushCard, mockClear } = vi.hoisted(() => ({
  mockUseOverlayChannel: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockPushCard: vi.fn(),
  mockClear: vi.fn(),
}));

/** A ranking pushed from the stage, of which the catalogue can draw one card. */
const TIER_LIST = {
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
  useClearOverlay: () => ({ mutate: mockClear, isPending: false }),
  useRotateOverlayToken: () => idleMutation,
  useUpdateOverlaySettings: () => ({ mutate: mockUpdateSettings, isPending: false }),
}));

// The panel's pointer to the tier lists is a router link, and this render has
// no router.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({
    printingsById: { [PRINTING.id]: PRINTING },
    cardsById: { [PRINTING.cardId]: PRINTING.card },
    printingsByCardId: new Map([[PRINTING.cardId, [PRINTING]]]),
  }),
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

// A ranking is put on stream from the show itself, where the creator can see
// the board they are pushing. What this panel still owns is showing whatever
// arrived and saying where it comes from.
describe("OverlayOutputPanel board on stream", () => {
  beforeEach(() => {
    mockClear.mockReset();
  });

  it("names the board on stream in the preview", () => {
    channelShowing(null, liveBoard(1));
    const { getAllByText } = render(<OverlayOutputPanel />);

    // Twice: as the preview's caption, and inside the frame the preview paints
    // with the very component the browser source runs.
    expect(getAllByText("Origins, ranked")).toHaveLength(2);
  });

  it("reads as live with a board up and no card", () => {
    channelShowing(null, liveBoard(1));
    const { getByText } = render(<OverlayOutputPanel />);

    expect(getByText("● Live")).toBeTruthy();
  });

  it("offers no controls of its own for the ranking", () => {
    channelShowing(null, liveBoard(1));
    const { queryByLabelText, queryByText } = render(<OverlayOutputPanel />);

    expect(queryByLabelText("Reveal the next card on the board")).toBeNull();
    expect(queryByText("Show whole board")).toBeNull();
  });

  it("says where a ranking comes from instead", () => {
    channelShowing(null);
    const { getByText } = render(<OverlayOutputPanel />);

    expect(getByText("tier lists")).toBeTruthy();
  });
});
