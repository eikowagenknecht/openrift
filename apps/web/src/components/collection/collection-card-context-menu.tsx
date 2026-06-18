import { BookOpenIcon, HandIcon, ListPlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { dispatchContextAction, dispatchTake } from "@/stores/card-row-actions-store";

interface CollectionCardContextMenuProps {
  /** Stack id (printingId in stacked views, copyId in copies view). */
  itemId: string;
  /**
   * Group "bulk box" only: show a "Take a copy" item that claims one copy from
   * the shared group collection into the viewer's inbox. Hidden on personal
   * collections.
   */
  canTake?: boolean;
  /**
   * Group "bulk box": when the card is on the viewer's wishlist, the number of
   * copies a single "take all you want" should claim — already capped to
   * `min(wished, copies in box)`. Only renders the extra item when > 1.
   */
  takeAllCount?: number;
  children?: ReactNode;
}

/**
 * Right-click / long-press menu on an owned collection card, mirroring the
 * floating action bar: Move, Add to list, Dispose. Each item dispatches to the
 * grid, which targets the current multi-selection when this card belongs to it
 * and otherwise selects just this card before acting. On a group "bulk box" it
 * also offers "Take a copy" (a free-pile claim into the viewer's inbox), plus a
 * "Take N copies" shortcut sized to how many the viewer still wants.
 * @returns The card wrapped with its context menu.
 */
export function CollectionCardContextMenu({
  itemId,
  canTake,
  takeAllCount,
  children,
}: CollectionCardContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {canTake && (
          <>
            <ContextMenuItem
              onClick={(event) => {
                event.stopPropagation();
                dispatchTake(itemId, 1);
              }}
            >
              <HandIcon />
              Take a copy
            </ContextMenuItem>
            {takeAllCount !== undefined && takeAllCount > 1 && (
              <ContextMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchTake(itemId, takeAllCount);
                }}
              >
                <HandIcon />
                Take {takeAllCount} copies
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          onClick={(event) => {
            event.stopPropagation();
            dispatchContextAction(itemId, "move");
          }}
        >
          <BookOpenIcon />
          Move
        </ContextMenuItem>
        <ContextMenuItem
          onClick={(event) => {
            event.stopPropagation();
            dispatchContextAction(itemId, "addToList");
          }}
        >
          <ListPlusIcon />
          Add to list
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onClick={(event) => {
            event.stopPropagation();
            dispatchContextAction(itemId, "dispose");
          }}
        >
          <Trash2Icon />
          Dispose
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
