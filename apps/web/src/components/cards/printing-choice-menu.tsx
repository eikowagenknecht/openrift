import type { Printing } from "@openrift/shared/types/catalog";
import type { MouseEvent, PointerEvent, ReactNode, RefObject } from "react";
import { useRef } from "react";

import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { PrintingRowContent } from "@/components/cards/printing-row";
import { usePrintingHover } from "@/components/cards/use-printing-hover";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

/**
 * Host must spread `popupRef` on its popup and render {@link PrintingChoicePreview}
 * outside it, or the popup's overflow clips the preview; call `reset` from `onOpenChange`, not unmount.
 */
export function usePrintingChoiceHover(clearDelayMs?: number) {
  const { hoveredId, onEnter, onLeave, reset } = usePrintingHover(clearDelayMs);
  const popupRef = useRef<HTMLDivElement>(null);

  // Touch and pen also fire pointerenter; only mouse should trigger a hover preview.
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
  // Remount per printing: an imageless entry unmounts the preview, and without
  // a fresh key the position effect won't re-run for the next hover.
  return <PrintingHoverPreview key={hovered.id} printing={hovered} anchorRef={anchorRef} />;
}

/**
 * Shared by the deck builder's row menu and the tier list's tile menu, which
 * differ only in what a pick means, not in how the list looks.
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
