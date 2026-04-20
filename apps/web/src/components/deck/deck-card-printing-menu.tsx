import { ContextMenu } from "@base-ui/react/context-menu";
import type { Printing } from "@openrift/shared";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCards } from "@/hooks/use-cards";
import { useDeckBuilderActions } from "@/hooks/use-deck-builder";
import { useEnumOrders } from "@/hooks/use-enums";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface DeckCardPrintingMenuProps {
  deckId: string;
  card: DeckBuilderCard;
  children: ReactNode;
}

const CURSOR_OFFSET_PX = 24;

/**
 * Right-click menu for a deck row: lists available printings with thumbnails
 * and a cursor-following hover preview. Click a printing to convert every
 * copy in this row; shift-click to split off a single copy.
 * @returns The wrapped children with the context menu attached.
 */
export function DeckCardPrintingMenu({ deckId, card, children }: DeckCardPrintingMenuProps) {
  const { changePreferredPrinting } = useDeckBuilderActions(deckId);
  const { printingsByCardId } = useCards();
  const languages = useDisplayStore((state) => state.languages);
  const allPrintings = printingsByCardId.get(card.cardId) ?? [];
  // Filter to the user's preferred languages, but always keep the currently
  // pinned printing visible even if its language is outside the filter.
  const printings =
    languages && languages.length > 0
      ? allPrintings.filter(
          (printing) =>
            languages.includes(printing.language) || printing.id === card.preferredPrintingId,
        )
      : allPrintings;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (printings.length <= 1) {
    return children;
  }

  const handleSelect = (printing: Printing, event: MouseEvent) => {
    const isShift = event.shiftKey;
    // Shift-click on a row with >1 copies splits off one copy to the target.
    // Otherwise convert the whole row.
    const count = isShift && card.quantity > 1 ? 1 : card.quantity;
    changePreferredPrinting(card.cardId, card.zone, card.preferredPrintingId, printing.id, count);
  };

  const hoveredPrinting = hoveredId ? printings.find((p) => p.id === hoveredId) : null;

  return (
    <ContextMenu.Root onOpenChange={(open) => !open && setHoveredId(null)}>
      <ContextMenu.Trigger
        className="block select-none [-webkit-touch-callout:none]"
        render={<div />}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="isolate z-50 outline-none" sideOffset={4}>
          <ContextMenu.Popup className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 ring-foreground/10 bg-popover text-popover-foreground z-50 max-h-[70vh] w-72 origin-(--transform-origin) overflow-y-auto rounded-lg p-1.5 shadow-md ring-1 outline-none">
            <div className="text-muted-foreground px-1.5 pt-1 pb-1.5 text-[10px] font-medium tracking-wide uppercase">
              Change printing
              {card.quantity > 1 && (
                <span className="text-muted-foreground/70 ml-1 hidden normal-case md:inline">
                  · shift-click to split 1
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              {printings.map((printing) => (
                <PrintingMenuItem
                  key={printing.id}
                  printing={printing}
                  printings={printings}
                  isActive={printing.id === card.preferredPrintingId}
                  onSelect={handleSelect}
                  onHover={setHoveredId}
                />
              ))}
            </div>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
      {hoveredPrinting && <PrintingHoverPreview printing={hoveredPrinting} />}
    </ContextMenu.Root>
  );
}

function PrintingMenuItem({
  printing,
  printings,
  isActive,
  onSelect,
  onHover,
}: {
  printing: Printing;
  printings: Printing[];
  isActive: boolean;
  onSelect: (printing: Printing, event: MouseEvent) => void;
  onHover: (id: string | null) => void;
}) {
  const thumbnail = printing.images.find((img) => img.face === "front")?.thumbnail ?? null;
  const { labels } = useEnumOrders();
  const label = formatPrintingLabel(printing, printings, labels);
  const landscape = printing.card.type === "Battlefield";
  const thumbnailSize = landscape ? "h-10 w-14" : "h-14 w-10";

  return (
    <ContextMenu.Item
      className={cn(
        "focus:bg-accent flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden select-none",
        isActive && "bg-muted ring-border ring-1",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(printing, event);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          onHover(printing.id);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          onHover(null);
        }
      }}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className={cn(thumbnailSize, "shrink-0 rounded object-cover")}
          draggable={false}
        />
      ) : (
        <div className={cn(thumbnailSize, "bg-muted shrink-0 rounded")} />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-muted-foreground font-mono text-xs">{formatCardId(printing)}</span>
        <span className="truncate text-xs">{label}</span>
      </span>
    </ContextMenu.Item>
  );
}

/**
 * Cursor-following large preview of a printing. Rendered via portal to body so
 * it can float above the context menu without being clipped.
 * @returns The portal'd preview element, or null when no front image exists.
 */
function PrintingHoverPreview({ printing }: { printing: Printing }) {
  const front = printing.images.find((img) => img.face === "front");
  const thumbnail = front?.thumbnail ?? null;
  const fullUrl = front?.full ?? null;
  const landscape = printing.card.type === "Battlefield";
  const [fullLoaded, setFullLoaded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setFullLoaded(false);
  }, [fullUrl]);

  useEffect(() => {
    const previewWidth = landscape ? 560 : 400;
    const previewHeight = landscape ? 400 : 560;

    const applyPosition = (clientX: number, clientY: number) => {
      const preview = previewRef.current;
      if (!preview) {
        return;
      }
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const right = clientX + CURSOR_OFFSET_PX + previewWidth;
      const left =
        right <= viewportWidth
          ? clientX + CURSOR_OFFSET_PX
          : clientX - CURSOR_OFFSET_PX - previewWidth;
      const top = Math.min(
        Math.max(0, clientY - previewHeight / 2),
        Math.max(0, viewportHeight - previewHeight),
      );
      preview.style.left = `${Math.max(0, left)}px`;
      preview.style.top = `${top}px`;
    };

    applyPosition(cursorRef.current.x, cursorRef.current.y);

    const handler = (event: globalThis.MouseEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY };
      applyPosition(event.clientX, event.clientY);
    };
    globalThis.addEventListener("mousemove", handler);
    return () => globalThis.removeEventListener("mousemove", handler);
  }, [landscape]);

  if (!thumbnail) {
    return null;
  }

  return createPortal(
    <div
      ref={previewRef}
      className={cn("pointer-events-none fixed z-[100]", landscape ? "w-[560px]" : "w-[400px]")}
    >
      <div className="relative">
        <img src={thumbnail} alt="" className="w-full rounded-lg shadow-lg" />
        {fullUrl && (
          <img
            src={fullUrl}
            alt=""
            onLoad={() => setFullLoaded(true)}
            className={cn(
              "absolute inset-0 w-full rounded-lg shadow-lg transition-opacity duration-150",
              fullLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
