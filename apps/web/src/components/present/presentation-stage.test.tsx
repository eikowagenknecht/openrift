import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PresentationItem } from "@/lib/presentation-queue";
import { usePresentationStore } from "@/stores/presentation-store";
import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { PresentationStage } from "./presentation-stage";

vi.mock("@/hooks/use-overlay", () => ({
  usePushOverlayCard: () => ({ mutate: vi.fn() }),
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

interface StageOptions {
  items?: PresentationItem[];
  editing?: boolean;
  /** Omitted entirely means a source with nothing to edit, e.g. a shared list. */
  withEdit?: boolean;
  index?: number;
}

function renderStage({
  items: queue = items,
  editing = false,
  withEdit = true,
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
