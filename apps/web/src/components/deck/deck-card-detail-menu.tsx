import { ContextMenu } from "@base-ui/react/context-menu";
import type { ReactNode } from "react";

interface DeckCardDetailMenuProps {
  onViewDetail: () => void;
  children: ReactNode;
}

/**
 * Wraps a deck-browser card with a context menu that opens the card detail view.
 * Fires on desktop right-click and mobile long-press via BaseUI's ContextMenu —
 * the same primitive used by DeckCardPrintingMenu.
 * @returns The wrapped children with the context menu attached.
 */
export function DeckCardDetailMenu({ onViewDetail, children }: DeckCardDetailMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="isolate z-50 outline-none" sideOffset={4}>
          <ContextMenu.Popup className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 ring-foreground/10 bg-popover text-popover-foreground z-50 w-44 origin-(--transform-origin) rounded-lg p-1.5 shadow-md ring-1 outline-none">
            <ContextMenu.Item
              className="focus:bg-accent flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetail();
              }}
            >
              View details
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
