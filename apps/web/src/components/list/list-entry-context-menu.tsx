import type { ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface ListEntryContextMenuProps {
  onRemove?: () => void;
  onTakeOff?: () => void;
  onViewDetail?: () => void;
  onSetPreference?: () => void;
  onMove?: () => void;
  onMoveToCollection?: () => void;
  onExclude?: () => void;
  children?: ReactNode;
}

export function ListEntryContextMenu({
  onRemove,
  onTakeOff,
  onViewDetail,
  onSetPreference,
  onMove,
  onMoveToCollection,
  onExclude,
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
        {onMoveToCollection ? (
          <ContextMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onMoveToCollection();
            }}
          >
            Move to collection…
          </ContextMenuItem>
        ) : null}
        {onTakeOff ? (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onTakeOff();
            }}
          >
            Take off list…
          </ContextMenuItem>
        ) : null}
        {onRemove ? (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            Remove from list
          </ContextMenuItem>
        ) : null}
        {onExclude ? (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onExclude();
            }}
          >
            Don&apos;t include this
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
