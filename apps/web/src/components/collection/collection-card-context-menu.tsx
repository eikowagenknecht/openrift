import { BookOpenIcon, ListPlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { dispatchContextAction } from "@/stores/card-row-actions-store";

interface CollectionCardContextMenuProps {
  /** Stack id (printingId in stacked views, copyId in copies view). */
  itemId: string;
  children?: ReactNode;
}

/**
 * Right-click / long-press menu on an owned collection card, mirroring the
 * floating action bar: Move, Add to list, Dispose. Each item dispatches to the
 * grid, which targets the current multi-selection when this card belongs to it
 * and otherwise selects just this card before acting.
 * @returns The card wrapped with its context menu.
 */
export function CollectionCardContextMenu({ itemId, children }: CollectionCardContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
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
