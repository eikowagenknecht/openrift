import type { Card } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import { useResponsiveColumns } from "@/hooks/use-responsive-columns";

import type { CardFields } from "./CardThumbnail";
import { CardThumbnail } from "./CardThumbnail";

export interface SetInfo {
  name: string;
  code: string;
}

interface CardGroup {
  set: SetInfo;
  cards: Card[];
}

function groupCardsBySet(cards: Card[], setOrder: SetInfo[]): CardGroup[] {
  const bySet = new Map<string, Card[]>();
  for (const card of cards) {
    let group = bySet.get(card.set);
    if (!group) {
      group = [];
      bySet.set(card.set, group);
    }
    group.push(card);
  }

  const groups: CardGroup[] = [];
  for (const setInfo of setOrder) {
    const setCards = bySet.get(setInfo.name);
    if (setCards) {
      groups.push({ set: setInfo, cards: setCards });
    }
  }

  return groups;
}

type VRow = { kind: "header"; set: SetInfo; cardCount: number } | { kind: "cards"; items: Card[] };

function buildVirtualRows(groups: CardGroup[], columns: number, showHeaders: boolean): VRow[] {
  const rows: VRow[] = [];
  for (const group of groups) {
    if (showHeaders) {
      rows.push({ kind: "header", set: group.set, cardCount: group.cards.length });
    }
    for (let i = 0; i < group.cards.length; i += columns) {
      rows.push({ kind: "cards", items: group.cards.slice(i, i + columns) });
    }
  }
  return rows;
}

const CARD_ASPECT = 1039 / 744;
const GAP = 16; // gap-4

interface CardGridProps {
  cards: Card[];
  setOrder: SetInfo[];
  onCardClick: (card: Card) => void;
  showImages?: boolean;
  selectedCardId?: string;
  cardFields?: CardFields;
}

export function CardGrid({
  cards,
  setOrder,
  onCardClick,
  showImages,
  selectedCardId,
  cardFields,
}: CardGridProps) {
  const { containerRef, columns } = useResponsiveColumns();
  const groups = useMemo(() => groupCardsBySet(cards, setOrder), [cards, setOrder]);
  const multipleGroups = groups.length > 1;

  const virtualRows = useMemo(
    () => buildVirtualRows(groups, columns, multipleGroups),
    [groups, columns, multipleGroups],
  );

  // Distance from the top of the document to the top of this container.
  // useWindowVirtualizer needs this to know which rows are in the viewport.
  // Re-measured whenever cards change (layout above may shift when the
  // ActiveFilters bar appears/disappears).
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const newMargin = Math.round(el.getBoundingClientRect().top + window.scrollY);
    setScrollMargin((prev) => (prev !== newMargin ? newMargin : prev));
  }, [cards, containerRef]);

  const hasLabel = cardFields
    ? cardFields.number || cardFields.title || cardFields.type || cardFields.rarity
    : true;

  const estimateSize = useCallback(
    (index: number): number => {
      const row = virtualRows[index];
      if (!row) {
        return 200;
      }
      if (row.kind === "header") {
        return 44;
      }
      const containerWidth = containerRef.current?.offsetWidth ?? 400;
      const cardWidth = (containerWidth - GAP * (columns - 1)) / columns;
      const imgHeight = cardWidth * CARD_ASPECT;
      const labelHeight = hasLabel ? 50 : 0;
      return Math.ceil(imgHeight + labelHeight) + GAP;
    },
    [virtualRows, columns, containerRef, hasLabel],
  );

  const virtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize,
    scrollMargin,
    overscan: 3,
  });

  const scrollToGroup = useCallback(
    (setName: string) => {
      const rowIndex = virtualRows.findIndex((r) => r.kind === "header" && r.set.name === setName);
      if (rowIndex !== -1) {
        virtualizer.scrollToIndex(rowIndex, { align: "start", behavior: "smooth" });
      }
    },
    [virtualRows, virtualizer],
  );

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No cards found</p>
        <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={containerRef}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {items.map((vItem) => {
          const row = virtualRows[vItem.index];
          if (!row) {
            return null;
          }

          return (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vItem.start - scrollMargin}px)`,
              }}
            >
              {row.kind === "header" ? (
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-2"
                    onClick={() => scrollToGroup(row.set.name)}
                  >
                    <span className="text-sm font-medium text-muted-foreground">
                      {row.set.code}
                    </span>
                    <span className="text-sm font-semibold">{row.set.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {row.cardCount}
                    </span>
                  </button>
                  <div className="h-px flex-1 bg-border" />
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: `${GAP}px`,
                    paddingBottom: `${GAP}px`,
                  }}
                >
                  {row.items.map((card) => (
                    <CardThumbnail
                      key={card.id}
                      card={card}
                      onClick={onCardClick}
                      showImages={showImages}
                      isSelected={card.id === selectedCardId}
                      cardFields={cardFields}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
