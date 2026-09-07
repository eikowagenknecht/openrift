import type { CollectionResponse } from "@openrift/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MoveDialog } from "./move-dialog";

function stubCollection(overrides: Partial<CollectionResponse> = {}): CollectionResponse {
  return {
    id: "col-1",
    name: "Deckbox",
    description: null,
    availableForDeckbuilding: true,
    sidebarHidden: false,
    isInbox: false,
    sortOrder: 0,
    isPublic: false,
    shareToken: null,
    copyCount: 0,
    totalValueCents: null,
    unpricedCopyCount: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    groupId: null,
    groupSlug: null,
    groupName: null,
    viewerCanAdmin: true,
    homeDecks: [],
    ...overrides,
  };
}

const onMove = vi.fn();

function renderDialog(props: { count: number; singleCard?: boolean }) {
  return render(
    <MoveDialog
      open
      onOpenChange={() => {}}
      collections={[stubCollection()]}
      count={props.count}
      singleCard={props.singleCard}
      onMove={onMove}
      isPending={false}
    />,
  );
}

function renderReopenable() {
  const dialog = (open: boolean) => (
    <MoveDialog
      open={open}
      onOpenChange={() => {}}
      collections={[stubCollection(), stubCollection({ id: "col-2", name: "Shoebox" })]}
      count={2}
      singleCard
      onMove={onMove}
      isPending={false}
    />
  );
  const view = render(dialog(true));
  return () => {
    view.rerender(dialog(false));
    view.rerender(dialog(true));
  };
}

// Renders into a portal on document.body: query document, not the render container.
function pickFirstCollection() {
  const row = document.querySelector<HTMLElement>('[data-slot="picker-row"]');
  if (!row) {
    throw new Error("No collection row rendered");
  }
  fireEvent.click(row);
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Move" }));
}

describe("MoveDialog quantity stepper", () => {
  beforeEach(() => {
    onMove.mockClear();
  });

  it("shows a stepper for a single card and defaults to moving every copy", () => {
    renderDialog({ count: 4, singleCard: true });

    expect(screen.getByText("Copies to move")).toBeInTheDocument();

    pickFirstCollection();
    submit();

    expect(onMove).toHaveBeenCalledWith("col-1", 4);
  });

  it("moves only the chosen number of copies after stepping down", () => {
    renderDialog({ count: 4, singleCard: true });

    const fewer = screen.getByRole("button", { name: "One fewer" });
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    expect(screen.getByText("2")).toBeInTheDocument();

    pickFirstCollection();
    submit();

    expect(onMove).toHaveBeenCalledWith("col-1", 2);
  });

  it("does not step above the available copies", () => {
    renderDialog({ count: 2, singleCard: true });

    const more = screen.getByRole("button", { name: "One more" });
    fireEvent.click(more);
    fireEvent.click(more);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(more).toBeDisabled();
  });

  it("moves everything with no stepper for a multi-card selection", () => {
    renderDialog({ count: 3, singleCard: false });

    expect(screen.queryByRole("button", { name: "One more" })).not.toBeInTheDocument();

    pickFirstCollection();

    expect(onMove).toHaveBeenCalledWith("col-1", 3);
  });

  it("shows no stepper when a single copy is targeted", () => {
    renderDialog({ count: 1, singleCard: true });

    expect(screen.queryByRole("button", { name: "One more" })).not.toBeInTheDocument();
  });

  it("keeps the move disabled until a collection is picked", () => {
    renderDialog({ count: 2, singleCard: true });

    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();

    pickFirstCollection();
    submit();

    expect(onMove).toHaveBeenCalledTimes(1);
  });
});

describe("MoveDialog collection choice", () => {
  beforeEach(() => {
    onMove.mockClear();
  });

  it("moves on the pick itself, with no confirm to press", () => {
    renderDialog({ count: 1 });

    expect(screen.queryByRole("button", { name: "Move" })).not.toBeInTheDocument();

    pickFirstCollection();

    expect(onMove).toHaveBeenCalledWith("col-1", 1);
  });

  it("forgets the last collection when it is reopened for a fresh target", () => {
    const reopen = renderReopenable();
    pickFirstCollection();
    reopen();

    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
    submit();
    expect(onMove).not.toHaveBeenCalled();
  });
});
