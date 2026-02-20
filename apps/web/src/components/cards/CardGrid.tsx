import type { Card } from "@openrift/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import { useResponsiveColumns } from "@/hooks/use-responsive-columns";

import { CardThumbnail } from "./CardThumbnail";

interface CardGridProps {
  cards: Card[];
  onCardClick: (card: Card) => void;
}

export function CardGrid({ cards, onCardClick }: CardGridProps) {
  const { containerRef, columns } = useResponsiveColumns();
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const result: Card[][] = [];
    for (let i = 0; i < cards.length; i += columns) {
      result.push(cards.slice(i, i + columns));
    }
    return result;
  }, [cards, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 320,
    overscan: 3,
  });

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No cards found</p>
        <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div ref={scrollRef} className="h-[calc(100vh-280px)] overflow-y-auto">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              className="absolute left-0 top-0 w-full"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid gap-4 pb-4"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {rows[virtualRow.index]?.map((card) => (
                  <CardThumbnail key={card.id} card={card} onClick={onCardClick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
