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
  /** When set, adds a "Trade preference…" item that opens the editor dialog. */
  onSetPreference?: () => void;
  /** When set, adds a "Move to list…" item. */
  onMove?: () => void;
  children?: ReactNode;
}

/**
 * Right-click / long-press menu on a list-entry tile. Mirrors the deck
 * card-detail menu pattern but offers Move / Remove (and an optional View
 * details) since lists don't have zone-aware quantity adjustment. When the
 * entry is part of the current select-mode selection, Move and Remove act on
 * the whole selection; otherwise just this entry (resolved by the browser).
 * @returns The wrapped children with a context menu attached.
 */
export function ListEntryContextMenu({
  onRemove,
  onViewDetail,
  onSetPreference,
  onMove,
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
      <ContextMenuContent className="w-48">
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
        {onSetPreference ? (
          <ContextMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onSetPreference();
            }}
          >
            Trade preference…
          </ContextMenuItem>
        ) : null}
        {onMove ? (
          <ContextMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onMove();
            }}
          >
            Move to list…
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
