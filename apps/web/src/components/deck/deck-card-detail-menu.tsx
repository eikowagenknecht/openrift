import type { ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface DeckCardDetailMenuProps {
  onViewDetail: () => void;
  children?: ReactNode;
}

/**
 * Wraps a deck-browser card with a context menu that opens the card detail view.
 * Fires on desktop right-click and mobile long-press.
 * @returns The wrapped children with the context menu attached.
 */
export function DeckCardDetailMenu({ onViewDetail, children }: DeckCardDetailMenuProps) {
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
            onViewDetail();
          }}
        >
          View details
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
