import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PresentationItem } from "@/lib/presentation-queue";
import { usePresentationStore } from "@/stores/presentation-store";
import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { PresentationStage } from "./presentation-stage";

const { mockPushBoard, mockSetReveal, mockClear } = vi.hoisted(() => ({
  mockPushBoard: vi.fn(() => Promise.resolve()),
  mockSetReveal: vi.fn(() => Promise.resolve()),
  mockClear: vi.fn(),
}));

vi.mock("@/hooks/use-overlay", () => ({
  usePushOverlayCard: () => ({ mutate: vi.fn() }),
  usePushOverlayBoard: () => ({ mutateAsync: mockPushBoard }),
  useSetOverlayBoardReveal: () => ({ mutateAsync: mockSetReveal }),
  useClearOverlay: () => ({ mutate: mockClear }),
}));

vi.mock("@/hooks/use-stage-presets", () => ({
  useStagePresets: () => ({ data: [] }),
  useCreateStagePreset: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Signed out by default: the OBS push key and the presets block both need a
// session, and neither is what these tests are about.
const userId = vi.fn<() => string | null>(() => null);
vi.mock("@/lib/auth-session", () => ({
  useUserId: () => userId(),
}));

// The strip renders card art through the image pipeline; a marker is enough to
// assert whether the stage put a running order on screen at all.
vi.mock("@/components/present/presentation-filmstrip", () => ({
  PresentationFilmstrip: () => <div data-testid="filmstrip" />,
}));

const resetPresentation = createStoreResetter(usePresentationStore);

const items: PresentationItem[] = [
  { id: "a", printing: stubPrinting(), contextLabel: "S" },
  { id: "b", printing: stubPrinting(), contextLabel: "A" },
];

/** What a tier source hands the stage to mirror onto the overlay. */
const obsBoard = {
  title: "Best legends",
  tiers: [{ label: "S", cards: [{ cardId: "card-a", printingId: null }] }],
  direction: "best-first" as const,
  revealCount: 1,
};

interface StageOptions {
  items?: PresentationItem[];
  editing?: boolean;
  /** Omitted entirely means a source with nothing to edit, e.g. a shared list. */
  withEdit?: boolean;
  /** Omitted means a source with no board to mirror, e.g. a deck walk. */
  withObsBoard?: boolean;
  index?: number;
}

function renderStage({
  items: queue = items,
  editing = false,
  withEdit = true,
  withObsBoard = true,
  index = 0,
}: StageOptions = {}) {
  const onIndexChange = vi.fn();
  const onToggle = vi.fn();
  const onExit = vi.fn();
  render(
    <PresentationStage
      items={queue}
      index={index}
      onIndexChange={onIndexChange}
      onExit={onExit}
      title="Best legends"
      boardControls
      obsBoard={withObsBoard ? obsBoard : undefined}
      edit={withEdit ? { editing, onToggle, status: "Saved" } : undefined}
    >
      <div data-testid="main">{editing ? "editor" : "show"}</div>
    </PresentationStage>,
  );
  return { onIndexChange, onToggle, onExit };
}

/** Fires a bare keydown on the document, the way the stage listens for one. */
function press(key: string) {
  fireEvent.keyDown(document, { key });
}

beforeEach(() => {
  userId.mockReturnValue(null);
});

afterEach(() => {
  resetPresentation();
  vi.clearAllMocks();
});

describe("PresentationStage while presenting", () => {
  it("marks the position in the queue", () => {
    renderStage();
    expect(screen.getByText(/S · 1 \/ 2/u)).toBeInTheDocument();
  });

  it("steps through the queue with the arrows", () => {
    const { onIndexChange } = renderStage();
    press("ArrowRight");
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("shows the filmstrip when it is switched on", () => {
    usePresentationStore.setState({ showStrip: true });
    renderStage();
    expect(screen.getByTestId("filmstrip")).toBeInTheDocument();
  });

  it("switches into the editor on E", () => {
    const { onToggle } = renderStage();
    press("e");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("leaves E alone on a source with nothing to edit", () => {
    const { onToggle, onIndexChange } = renderStage({ withEdit: false });
    press("e");
    expect(onToggle).not.toHaveBeenCalled();
    // Still a live stage otherwise — E being inert must not mean the rest is.
    press("ArrowRight");
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });
});

describe("PresentationStage while editing", () => {
  it("puts the save state in the corner instead of the queue position", () => {
    renderStage({ editing: true });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByText(/1 \/ 2/u)).not.toBeInTheDocument();
  });

  it("renders whatever the source put in the middle", () => {
    renderStage({ editing: true });
    expect(screen.getByTestId("main")).toHaveTextContent("editor");
  });

  // The load-bearing one. dnd-kit's PointerSensor leaves the keyboard alone, so
  // nothing here collides with a drag — but an arrow that still stepped a queue
  // the creator cannot see would move the show out from under them the moment
  // they switched back.
  it("hands the walk's keys back rather than stepping a hidden queue", () => {
    const { onIndexChange } = renderStage({ editing: true });
    for (const key of ["ArrowRight", "ArrowLeft", " ", "Home", "End"]) {
      press(key);
    }
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("leaves the show's layer toggles alone", () => {
    renderStage({ editing: true });
    for (const key of ["t", "f", "b", "c", "k", "r", "d"]) {
      press(key);
    }
    const state = usePresentationStore.getState();
    expect(state).toMatchObject({
      showText: false,
      showStrip: false,
      boardMode: true,
      showHero: true,
      showRank: true,
      reveal: false,
      direction: "best-first",
    });
  });

  it("keeps the key list on ?", () => {
    renderStage({ editing: true });
    press("?");
    expect(usePresentationStore.getState().showHelp).toBe(true);
    expect(screen.getByText("Back to the show")).toBeInTheDocument();
  });

  it("does not list the keys it just stood down", () => {
    renderStage({ editing: true });
    press("?");
    expect(screen.queryByText("Step through the queue")).not.toBeInTheDocument();
    expect(screen.queryByText("Fill the board as you go")).not.toBeInTheDocument();
  });

  it("switches back to the show on E", () => {
    const { onToggle } = renderStage({ editing: true });
    press("e");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("takes the filmstrip down even when it is switched on", () => {
    usePresentationStore.setState({ showStrip: true });
    renderStage({ editing: true });
    expect(screen.queryByTestId("filmstrip")).not.toBeInTheDocument();
  });

  it("leaves the OBS push key to the show", () => {
    userId.mockReturnValue("user-1");
    renderStage({ editing: true });
    press("?");
    expect(screen.queryByText(/OBS overlay/u)).not.toBeInTheDocument();
  });
});

describe("PresentationStage board on OBS", () => {
  beforeEach(() => {
    userId.mockReturnValue("user-1");
  });

  it("puts the board up as the stage has it", () => {
    renderStage();

    press("o");

    expect(mockPushBoard).toHaveBeenCalledWith({
      board: { ...obsBoard, revealCount: 1 },
    });
  });

  it("takes it back down when the switch goes off again", () => {
    renderStage();

    press("o");
    press("o");

    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it("lists the key while a board can be mirrored", () => {
    renderStage();
    press("?");
    expect(screen.getByText("Show this board on the OBS overlay")).toBeInTheDocument();
  });

  it("leaves O alone on a source with no board to mirror", () => {
    // A deck walk has nothing to put up, so the key keeps whatever the browser
    // does with it rather than being swallowed for nothing.
    renderStage({ withObsBoard: false });

    press("o");
    press("?");

    expect(mockPushBoard).not.toHaveBeenCalled();
    expect(screen.queryByText(/Show this board/u)).not.toBeInTheDocument();
  });

  it("leaves O alone while signed out, since there is no channel to push to", () => {
    userId.mockReturnValue(null);
    renderStage();

    press("o");

    expect(mockPushBoard).not.toHaveBeenCalled();
  });

  it("stands the mirror down while the board is being ranked", () => {
    // The switch is off the settings panel while editing, so the key that does
    // the same thing has to be inert too.
    renderStage({ editing: true });

    press("o");

    expect(mockPushBoard).not.toHaveBeenCalled();
  });
});

describe("PresentationStage with nothing queued", () => {
  // A fresh tier list is entirely unranked, so this is the state the stage opens
  // in the first time it is used, not an error path.
  it("points an editable source at the way to fill it", () => {
    renderStage({ items: [] });
    expect(screen.getByText(/Press E to start ranking/u)).toBeInTheDocument();
  });

  it("says so plainly when there is nothing to edit either", () => {
    renderStage({ items: [], withEdit: false });
    expect(screen.getByText("Nothing to show here.")).toBeInTheDocument();
  });

  it("still opens the editor, which is the whole point of an empty board", () => {
    renderStage({ items: [], editing: true });
    expect(screen.getByTestId("main")).toHaveTextContent("editor");
    expect(screen.queryByText(/Press E to start ranking/u)).not.toBeInTheDocument();
  });
});
