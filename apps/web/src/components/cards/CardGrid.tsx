import type { Card } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
const APP_HEADER_HEIGHT = 56; // h-14

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

  // Precompute cumulative start offsets (within the virtual list) for each row.
  // Used by the sticky-header scroll listener to find which header is active
  // without touching the DOM on every scroll event.
  const rowStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (let i = 0; i < virtualRows.length; i++) {
      starts.push(acc);
      acc += estimateSize(i);
    }
    return starts;
  }, [virtualRows, estimateSize]);

  // scrollMarginRef holds the same value as scrollMargin state but is readable
  // synchronously inside the scroll listener without a stale closure — this is
  // what breaks the update cycle that previously caused infinite re-renders.
  const scrollMarginRef = useRef(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Which header row has fully scrolled past the sticky point.
  // "Fully" means its END is above the threshold so the virtual row itself
  // is no longer visible — this prevents the sticky overlay and the virtual
  // header row from being visible at the same time.
  const [activeHeaderRow, setActiveHeaderRow] = useState<(VRow & { kind: "header" }) | null>(null);

  // The first header that comes after activeHeaderRow in the list — shown in
  // the bottom overlay so the user can jump forward to the next section.
  const nextHeaderRow = useMemo<(VRow & { kind: "header" }) | null>(() => {
    if (!activeHeaderRow) {
      return null;
    }
    let found = false;
    for (const row of virtualRows) {
      if (row.kind !== "header") {
        continue;
      }
      if (found) {
        return row;
      }
      if (row.set.name === activeHeaderRow.set.name) {
        found = true;
      }
    }
    return null;
  }, [activeHeaderRow, virtualRows]);

  // Re-measure the container's document offset when the card list changes.
  // useLayoutEffect runs before paint so corrections are invisible to the user.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const newMargin = Math.round(el.getBoundingClientRect().top + window.scrollY);
    if (newMargin !== scrollMarginRef.current) {
      scrollMarginRef.current = newMargin;
      setScrollMargin(newMargin);
    }
  }, [cards, containerRef]);

  useEffect(() => {
    if (!multipleGroups) {
      setActiveHeaderRow(null);
      return;
    }

    const update = () => {
      // Read from ref (not the closed-over state value) so the threshold is
      // always current even when the sticky overlay's presence shifts the
      // container. scrollMargin is intentionally excluded from deps to avoid
      // the re-subscribe cycle that caused the infinite update loop.
      const threshold = window.scrollY - scrollMarginRef.current + APP_HEADER_HEIGHT;

      // Build a map of measured start positions for currently-rendered items.
      // rowStarts uses estimated sizes and can drift significantly with many rows
      // (Math.ceil rounding accumulates). The virtualizer's own positions are
      // accurate for rendered items, so we prefer those at boundaries.
      // vItem.start is an absolute document position (includes scrollMargin).
      // Subtract scrollMarginRef to convert to virtual-list coordinates so it
      // can be compared against threshold (which is also virtual-list-relative).
      const measuredStarts = new Map(
        virtualizerRef.current
          .getVirtualItems()
          .map((item) => [item.index, item.start - scrollMarginRef.current]),
      );

      // Walk header rows; the active one is the last header whose top has
      // reached or crossed the sticky threshold (≤ so the exact boundary
      // position — which scrollToIndex targets — activates the correct set).
      let active: (VRow & { kind: "header" }) | null = null;
      for (let i = 0; i < virtualRows.length; i++) {
        const row = virtualRows[i];
        if (row.kind !== "header") {
          continue;
        }
        const start = measuredStarts.get(i) ?? rowStarts[i];
        if (start <= threshold + 1) {
          active = row;
        }
      }
      setActiveHeaderRow(active);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [virtualRows, rowStarts, estimateSize, multipleGroups]);

  const virtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize,
    scrollMargin,
    scrollPaddingStart: APP_HEADER_HEIGHT,
    overscan: 3,
  });

  // Keep a ref so the scroll handler always reads the virtualizer's current
  // measured item positions rather than estimated ones (which drift at scale).
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const [indicator, setIndicator] = useState({
    cardId: "",
    thumbTop: 0,
    thumbH: 0,
    visible: false,
  });
  const hideTimerRef = useRef(0);

  useEffect(() => {
    const update = () => {
      // Use virtualizer's actual measured start positions — vItem.start is the
      // absolute document Y of the row top (scrollMargin already included).
      const threshold = window.scrollY + APP_HEADER_HEIGHT;
      const vItems = virtualizerRef.current.getVirtualItems();
      let firstCard: Card | null = null;
      for (const vItem of vItems) {
        const row = virtualRows[vItem.index];
        if (!row || row.kind !== "cards") {
          continue;
        }
        if (vItem.start + vItem.size > threshold) {
          firstCard = row.items[0] ?? null;
          break;
        }
      }
      if (!firstCard) {
        return;
      }
      // Compute the scrollbar thumb position so the indicator can track it.
      // Browsers enforce a minimum thumb height (~17px); we use a safe floor.
      const viewportH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      const thumbH = Math.max(17, (viewportH / docH) * viewportH);
      const scrollableHeight = docH - viewportH;
      const yPercent = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
      const thumbTop = yPercent * (viewportH - thumbH);
      setIndicator({ cardId: firstCard.id, thumbTop, thumbH, visible: true });
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        setIndicator((prev) => ({ ...prev, visible: false }));
      }, 1200);
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.clearTimeout(hideTimerRef.current);
    };
  }, [virtualRows]);

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
    <>
      {/* Scroll position indicator — appears while scrolling, fades out after idle */}
      <div
        className="pointer-events-none fixed z-20 transition-opacity duration-300"
        style={{
          right: 20,
          top: Math.max(
            APP_HEADER_HEIGHT + 4,
            Math.min(
              window.innerHeight - 32,
              Math.round(indicator.thumbTop + indicator.thumbH / 2 - 14),
            ),
          ),
          opacity: indicator.visible ? 1 : 0,
        }}
      >
        <div className="rounded-md bg-popover/90 px-2.5 py-1 text-xs font-mono font-medium text-popover-foreground shadow-md ring-1 ring-border/50 backdrop-blur-sm">
          {indicator.cardId || "\u00A0"}
        </div>
      </div>

      {/* Sticky set header overlay — visible only after a section header has
          fully scrolled above the sticky threshold. The incoming virtual header
          row handles the visual "push" as it approaches from below. */}
      {multipleGroups && activeHeaderRow && (
        <div
          className="fixed left-0 right-0 z-10 flex items-center gap-3 bg-background/80 px-4 py-2 backdrop-blur-lg"
          style={{ top: APP_HEADER_HEIGHT }}
        >
          <div className="h-px flex-1 bg-border" />
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2"
            onClick={() => scrollToGroup(activeHeaderRow.set.name)}
          >
            <span className="text-sm font-medium text-muted-foreground">
              {activeHeaderRow.set.code}
            </span>
            <span className="text-sm font-semibold">{activeHeaderRow.set.name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {activeHeaderRow.cardCount}
            </span>
          </button>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* Bottom overlay — shows the next section so the user can jump forward */}
      {multipleGroups && nextHeaderRow && (
        <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center gap-3 bg-background/80 px-4 py-2 backdrop-blur-lg">
          <div className="h-px flex-1 bg-border" />
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2"
            onClick={() => scrollToGroup(nextHeaderRow.set.name)}
          >
            <span className="text-sm font-medium text-muted-foreground">
              {nextHeaderRow.set.code}
            </span>
            <span className="text-sm font-semibold">{nextHeaderRow.set.name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {nextHeaderRow.cardCount}
            </span>
          </button>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

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
    </>
  );
}
