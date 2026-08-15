import type { Card, Printing, TierRow } from "@openrift/shared";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StageEditControls } from "@/components/present/presentation-stage";
import type { PresentationItem } from "@/lib/presentation-queue";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";
import { stubCard, stubPrinting } from "@/test/factories";

import { OwnedTierListPresentation } from "./tier-list-presentation";

const LIST_ID = "list-1";

const printingA = stubPrinting({ cardId: "card-a", card: { name: "Ekko" } });
const printingB = stubPrinting({ cardId: "card-b", card: { name: "Jinx" } });

const cardsById: Record<string, Card> = {
  "card-a": stubCard({ name: "Ekko" }),
  "card-b": stubCard({ name: "Jinx" }),
};
const printingsByCardId = new Map<string, Printing[]>([
  ["card-a", [printingA]],
  ["card-b", [printingB]],
]);

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ cardsById, printingsByCardId }),
}));

/** The saved board: one card ranked, one tier left empty. */
const savedTiers: TierRow[] = [
  { label: "S", cards: [{ cardId: "card-a", printingId: printingA.id }] },
  { label: "A", cards: [] },
];

const tierListData = { data: { id: LIST_ID, title: "Best legends", tiers: savedTiers } };
vi.mock("@/hooks/use-tier-lists", () => ({
  useTierList: () => tierListData,
  usePublicTierList: () => ({ data: { tierList: { title: "", tiers: [] }, owner: {} } }),
}));

const flush = vi.fn();
const autosave = { saving: false, flush };
vi.mock("@/hooks/use-tier-list-autosave", () => ({
  useTierListAutosave: () => autosave,
}));

// The three middles are stubbed to markers. Each is tested where it lives, and
// the real ones draw card art through the router and the catalog query — none of
// which bears on the two questions here: which board feeds the queue, and which
// middle the stage is handed.
vi.mock("@/components/tier-lists/tier-list-dnd-context", () => ({
  TierListDndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/tier-lists/tier-board-editor", () => ({
  TierBoardEditor: () => <div data-testid="editor" />,
}));
vi.mock("@/components/present/tier-stage-main", () => ({
  TierStageMain: () => <div data-testid="board-show" />,
}));
vi.mock("@/components/present/card-stage-main", () => ({
  CardStageMain: () => <div data-testid="card-show" />,
}));

/**
 * Captures what the tier source hands the stage. The queue is the whole
 * question — everything the show puts on screen is derived from it.
 */
interface StageCall {
  items: PresentationItem[];
  index: number;
  onExit: () => void;
  edit?: StageEditControls;
  children: ReactNode;
}
const stageCalls: StageCall[] = [];
vi.mock("@/components/present/presentation-stage", () => ({
  PresentationStage: (props: StageCall) => {
    stageCalls.push(props);
    return <div data-testid="stage">{props.children}</div>;
  },
}));

/** @returns The props of the most recent stage render. */
function lastStage(): StageCall {
  const call = stageCalls.at(-1);
  if (!call) {
    throw new Error("the stage was never rendered");
  }
  return call;
}

/** @returns The card names the show would walk, in queue order. */
function queuedCardIds(): string[] {
  return lastStage().items.map((item) => item.printing.cardId);
}

function renderOwned({ editing = false, index = 0 } = {}) {
  const onEditingChange = vi.fn();
  const onExit = vi.fn();
  const view = render(
    <OwnedTierListPresentation
      tierListId={LIST_ID}
      index={index}
      editing={editing}
      onEditingChange={onEditingChange}
      onIndexChange={vi.fn()}
      onExit={onExit}
    />,
  );
  return { ...view, onEditingChange, onExit };
}

beforeEach(() => {
  stageCalls.length = 0;
  autosave.saving = false;
  useTierListBuilderStore.getState().reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OwnedTierListPresentation", () => {
  it("adopts the saved board into the draft", () => {
    renderOwned();
    const state = useTierListBuilderStore.getState();
    expect(state.listId).toBe(LIST_ID);
    expect(state.rows).toHaveLength(2);
    expect(state.dirty).toBe(false);
  });

  it("walks the board it was opened with", () => {
    renderOwned();
    expect(queuedCardIds()).toEqual(["card-a"]);
  });

  it("drops the draft on the way out, so the list reopens from the server", () => {
    const { unmount } = renderOwned();
    unmount();
    expect(useTierListBuilderStore.getState().listId).toBeNull();
  });

  // The autosave debounce can hold the last few drags for over a second, which
  // is easily less than the time between a creator's last drag and their Escape.
  it("sends what is still queued before leaving the stage", () => {
    const { onExit } = renderOwned();
    act(() => {
      lastStage().onExit();
    });
    expect(flush).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });
});

// The claim the merge rests on: the show and the editor read one board, so
// switching between them never shows a card that was ranked a moment ago as
// still missing. Presenting off the *saved* board instead would fail these,
// because the save is debounced and its refetch is not free.
describe("OwnedTierListPresentation draft as the single source of truth", () => {
  it("puts a card ranked in the editor straight into the show's queue", () => {
    renderOwned({ editing: true });
    act(() => {
      useTierListBuilderStore.getState().assign("card-b", 1);
    });
    expect(queuedCardIds()).toEqual(["card-a", "card-b"]);
  });

  it("takes an unranked card back out of the queue", () => {
    renderOwned({ editing: true });
    act(() => {
      useTierListBuilderStore.getState().unassign("card-a");
    });
    expect(queuedCardIds()).toEqual([]);
  });

  it("ignores a refetch of the saved board while a draft is loaded", () => {
    renderOwned();
    act(() => {
      useTierListBuilderStore.getState().assign("card-b", 1);
    });
    // What the autosave's invalidation looks like from here: the query hands
    // back a new array for the same list. The draft must survive it.
    tierListData.data = { ...tierListData.data, tiers: [...savedTiers] };
    act(() => {
      useTierListBuilderStore.getState().assign("card-b", 0);
    });
    expect(queuedCardIds()).toEqual(["card-a", "card-b"]);
    tierListData.data = { id: LIST_ID, title: "Best legends", tiers: savedTiers };
  });

  it("keeps the index inside a queue the editor shrank", () => {
    renderOwned({ index: 1 });
    act(() => {
      useTierListBuilderStore.getState().assign("card-b", 1);
    });
    expect(lastStage().index).toBe(1);
    act(() => {
      useTierListBuilderStore.getState().unassign("card-b");
    });
    // Clamped rather than left dangling: an out-of-range index renders a blank
    // stage, which on a capture is a black hole where the show was.
    expect(lastStage().index).toBe(0);
    expect(lastStage().items).toHaveLength(1);
  });
});

describe("OwnedTierListPresentation edit switch", () => {
  it("mounts the editor while editing", () => {
    const { getByTestId } = renderOwned({ editing: true });
    expect(getByTestId("editor")).toBeInTheDocument();
  });

  it("puts the show back rather than the editor while presenting", () => {
    const { queryByTestId, getByTestId } = renderOwned();
    expect(queryByTestId("editor")).not.toBeInTheDocument();
    expect(getByTestId("board-show")).toBeInTheDocument();
  });

  it("reports the save state so the creator can see the ranking land", () => {
    autosave.saving = true;
    renderOwned({ editing: true });
    expect(lastStage().edit?.status).toBe("Saving…");
  });

  it.each([
    [false, true],
    [true, false],
  ])("toggling from editing=%s asks for %s", (editing, expected) => {
    const { onEditingChange } = renderOwned({ editing });
    act(() => {
      lastStage().edit?.onToggle();
    });
    expect(onEditingChange).toHaveBeenCalledWith(expected);
  });
});
