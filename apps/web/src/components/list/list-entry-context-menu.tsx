import type { ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface ListEntryContextMenuProps {
  onRemove: () => void;
  onViewDetail?: () => void;
  children: ReactNode;
}

/**
 * Right-click / long-press menu on a list-entry tile. Mirrors the deck
 * card-detail menu pattern but offers Remove (and an optional View details)
 * since lists don't have zone-aware quantity adjustment.
 * @returns The wrapped children with a context menu attached.
 */
export function ListEntryContextMenu({
  onRemove,
  onViewDetail,
  children,
}: ListEntryContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {onViewDetail ? (
          <ContextMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onViewDetail();
            }}
          >
            View details
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          Remove from list
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
