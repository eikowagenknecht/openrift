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
