import type { Printing } from "@openrift/shared";
import type { MouseEvent, PointerEvent, ReactNode, RefObject } from "react";
import { useRef } from "react";

import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { PrintingRowContent } from "@/components/cards/printing-row";
import { usePrintingHover } from "@/components/cards/use-printing-hover";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

/**
 * The hover-preview wiring every printing chooser repeats: which row the mouse
 * is on, and the anchor the floating preview positions against.
 *
 * The anchor is the host's own popup element (a context menu's content, a
 * select's content), so the host spreads `popupRef` onto it and renders
 * {@link PrintingChoicePreview} *outside* that popup — inside it the preview
 * would be clipped by the popup's own overflow. Hover state lives above the
 * popup for the same reason, which is why `reset` has to run on close rather
 * than falling out of unmounting.
 *
 * @param clearDelayMs How long a leave waits before clearing, so the preview
 *   doesn't flash while the pointer crosses between adjacent rows.
 * @returns The anchor ref, the per-row pointer handlers, the hovered id, and a
 *   `reset` for the host's `onOpenChange`.
 */
export function usePrintingChoiceHover(clearDelayMs?: number) {
  const { hoveredId, onEnter, onLeave, reset } = usePrintingHover(clearDelayMs);
  const popupRef = useRef<HTMLDivElement>(null);

  // Touch and pen never hover, and firing on them would strand a preview over
  // the list the tap is trying to read.
  const hoverProps = (printingId: string) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        onEnter(printingId);
      }
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        onLeave();
      }
    },
  });

  return { hoveredId, popupRef, hoverProps, reset };
}

/**
 * The floating card preview for whichever printing the pointer is on. Renders
 * nothing when the pointer is off the list, or on a row whose printing is no
 * longer in `printings`.
 *
 * @returns The preview, or null.
 */
export function PrintingChoicePreview({
  hoveredId,
  printings,
  anchorRef,
}: {
  hoveredId: string | null;
  printings: readonly Printing[];
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const hovered = hoveredId === null ? undefined : printings.find((p) => p.id === hoveredId);
  if (!hovered) {
    return null;
  }
  // Keyed per printing so the preview remounts on each hover; without a fresh
  // mount the position effect won't re-run after an imageless entry unmounts
  // the preview, leaving later previews mispositioned.
  return <PrintingHoverPreview key={hovered.id} printing={hovered} anchorRef={anchorRef} />;
}

/**
 * The "Change printing" block of a context menu: the section label, an optional
 * "Use default printing" escape hatch, and one row per printing. Shared by the
 * deck builder's row menu and the tier list's tile menu, which differ only in
 * what a pick means, not in how the list looks.
 *
 * Renders nothing when there are no printings to offer, so a host can drop it
 * in without guarding first.
 *
 * @param props.hint Trailing note on the section label (the deck menu's
 *   shift-click hint); hidden on phones by the caller's own markup.
 * @param props.onSelectDefault Omit when the surface has no default to fall
 *   back to, which also hides the row.
 * @returns The section, or null when there is nothing to choose from.
 */
export function PrintingChoiceMenuSection({
  printings,
  activePrintingId,
  hoverProps,
  hint,
  onSelect,
  onSelectDefault,
}: {
  printings: readonly Printing[];
  activePrintingId: string | null;
  hoverProps: (printingId: string) => {
    onPointerEnter: (event: PointerEvent) => void;
    onPointerLeave: (event: PointerEvent) => void;
  };
  hint?: ReactNode;
  onSelect: (printing: Printing, event: MouseEvent) => void;
  onSelectDefault?: (event: MouseEvent) => void;
}) {
  if (printings.length === 0) {
    return null;
  }
  return (
    <>
      <div className="text-muted-foreground text-2xs px-1.5 pt-1 pb-1.5 font-medium tracking-wide uppercase">
        Change printing
        {hint}
      </div>
      <div className="flex flex-col gap-0.5">
        {activePrintingId !== null && onSelectDefault && (
          <ContextMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onSelectDefault(event);
            }}
          >
            Use default printing
          </ContextMenuItem>
        )}
        {printings.map((printing) => (
          <ContextMenuItem
            key={printing.id}
            className={cn(printing.id === activePrintingId && "bg-muted ring-border ring-1")}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(printing, event);
            }}
            {...hoverProps(printing.id)}
          >
            <PrintingRowContent printing={printing} siblings={printings} />
          </ContextMenuItem>
        ))}
      </div>
    </>
  );
}
