import type { Card } from "@openrift/shared";
import { Fragment, useCallback, useMemo, useRef } from "react";

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
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const scrollToGroup = useCallback((setName: string) => {
    const el = groupRefs.current.get(setName);
    if (!el) return;
    const headerHeight = 56; // h-14
    const top = el.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No cards found</p>
        <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {groups.map((group, groupIndex) => (
        <Fragment key={`group-${group.set.name}-${groupIndex}`}>
          {multipleGroups && (
            <>
              <div
                ref={(el) => {
                  if (el) groupRefs.current.set(group.set.name, el);
                }}
                className="col-span-full h-0"
                aria-hidden="true"
              />
              <div className="sticky top-14 z-10 col-span-full flex items-center gap-3 bg-background/80 py-2 backdrop-blur-lg">
                <div className="h-px flex-1 bg-border" />
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-2"
                  onClick={() => scrollToGroup(group.set.name)}
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    {group.set.code}
                  </span>
                  <span className="text-sm font-semibold">{group.set.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {group.cards.length}
                  </span>
                </button>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          {group.cards.map((card) => (
            <CardThumbnail
              key={card.id}
              card={card}
              onClick={onCardClick}
              showImages={showImages}
              isSelected={card.id === selectedCardId}
              cardFields={cardFields}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
