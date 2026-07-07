import { useRef } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { backgroundLayout, buildAttribution } from "@/lib/card-designer";
import { cn } from "@/lib/utils";
import { useCardDesignerStore } from "@/stores/card-designer-store";

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * The live card preview. Subscribes to the designer store and renders through
 * the shared `CardPlaceholderImage`. When `interactive` and a background image
 * is present, dragging repositions the image (pan); zoom is driven from the
 * separate controls. The non-interactive variant is used for the off-screen
 * export clone.
 *
 * @returns The preview element.
 */
export function CardDesignerPreview({
  interactive = false,
  forExport = false,
  className,
}: {
  interactive?: boolean;
  /** Render glyph icons from pre-tinted white rasters so html2canvas can capture them. */
  forExport?: boolean;
  className?: string;
}) {
  const card = useCardDesignerStore((state) => state.card);
  const background = useCardDesignerStore((state) => state.background);
  const showAttribution = useCardDesignerStore((state) => state.showAttribution);
  const setImageTransform = useCardDesignerStore((state) => state.setImageTransform);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const hasImage = background.dataUrl !== null;
  const draggable = interactive && hasImage;

  const layout = hasImage
    ? backgroundLayout(background.aspect, background.scale, background.offsetX, background.offsetY)
    : null;
  const backgroundImageStyle = layout
    ? {
        position: "absolute" as const,
        width: `${layout.widthPct}%`,
        height: `${layout.heightPct}%`,
        left: `${layout.leftPct}%`,
        top: `${layout.topPct}%`,
        maxWidth: "none",
        maxHeight: "none",
      }
    : undefined;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: background.offsetX,
      offsetY: background.offsetY,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container || event.pointerId !== drag.pointerId) {
      return;
    }
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const deltaX = (event.clientX - drag.startX) / rect.width;
    const deltaY = (event.clientY - drag.startY) / rect.height;
    setImageTransform({ offsetX: drag.offsetX + deltaX, offsetY: drag.offsetY + deltaY });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(draggable && "cursor-grab touch-none active:cursor-grabbing", className)}
    >
      <CardPlaceholderImage
        name={card.name}
        domain={card.domains}
        energy={card.energy}
        might={card.might}
        power={card.power}
        types={card.type ? [card.type] : undefined}
        superTypes={card.superTypes}
        tags={card.tags}
        rulesText={card.rulesText || null}
        effectText={card.effectText || null}
        mightBonus={card.mightBonus}
        flavorText={card.flavorText || null}
        rarity={card.rarity ?? undefined}
        publicCode={card.publicCode || undefined}
        artist={buildAttribution(card.artist, showAttribution)}
        backgroundImageUrl={background.dataUrl ?? undefined}
        backgroundImageStyle={backgroundImageStyle}
        tintIcons={forExport}
      />
    </div>
  );
}
