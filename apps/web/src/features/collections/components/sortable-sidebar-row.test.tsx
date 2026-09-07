import { DndContext } from "@dnd-kit/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SortableSidebarRow } from "./sortable-sidebar-row";

// The onTouchStart spy stands in for Base UI's ContextMenuTrigger, which
// starts its long-press timer from a React onTouchStart on an ancestor of the grip.
function renderRow() {
  const onTouchStart = vi.fn();
  render(
    <DndContext>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for Base UI's context-menu trigger */}
      <div onTouchStart={onTouchStart}>
        <SortableSidebarRow
          id="sortable-collection-c1"
          data={{ type: "sidebar-reorder-collection", collectionId: "c1" }}
          label="Binder"
        >
          {(handle) => <div>{handle}</div>}
        </SortableSidebarRow>
      </div>
    </DndContext>,
  );
  return onTouchStart;
}

describe("SortableSidebarRow", () => {
  it("keeps a touch on the grip away from the row's context-menu trigger", () => {
    const onTouchStart = renderRow();

    fireEvent.touchStart(screen.getByRole("button", { name: "Reorder Binder" }), {
      touches: [{ clientX: 10, clientY: 10 }],
    });

    expect(onTouchStart).not.toHaveBeenCalled();
  });

  it("still lets a touch elsewhere in the row reach the context-menu trigger", () => {
    const onTouchStart = renderRow();

    fireEvent.touchStart(screen.getByRole("button", { name: "Reorder Binder" }).parentElement!, {
      touches: [{ clientX: 10, clientY: 10 }],
    });

    expect(onTouchStart).toHaveBeenCalledTimes(1);
  });

  it("opts the grip out of browser panning so the drag survives the first move", () => {
    renderRow();

    expect(screen.getByRole("button", { name: "Reorder Binder" })).toHaveClass("touch-none");
  });
});
