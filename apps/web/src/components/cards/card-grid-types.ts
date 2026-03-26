import type { Printing } from "@openrift/shared";

export interface SetInfo {
  id: string;
  slug: string;
  name: string;
}

interface CardGroup {
  set: SetInfo;
  cards: Printing[];
}

export type VRow =
  | { kind: "header"; set: SetInfo; cardCount: number }
  | { kind: "cards"; items: Printing[]; cardsBefore: number };

export interface IndicatorState {
  cardId: string;
  indicatorTop: number;
  visible: boolean;
  dragging: boolean;
}

export interface SnapPoint {
  rowIndex: number;
  setInfo: SetInfo;
  screenY: number;
  cardCount: number;
  firstCardId: string;
}

export function groupCardsBySet(cards: Printing[], setOrder: SetInfo[]): CardGroup[] {
  const bySet = new Map<string, Printing[]>();
  for (const printing of cards) {
    let group = bySet.get(printing.setId);
    if (!group) {
      group = [];
      bySet.set(printing.setId, group);
    }
    group.push(printing);
  }

  const groups: CardGroup[] = [];
  for (const setInfo of setOrder) {
    const setCards = bySet.get(setInfo.id);
    if (setCards) {
      groups.push({ set: setInfo, cards: setCards });
    }
  }

  return groups;
}

export function buildVirtualRows(
  groups: CardGroup[],
  columns: number,
  showHeaders: boolean,
): VRow[] {
  const rows: VRow[] = [];
  let cardsBefore = 0;
  for (const group of groups) {
    if (showHeaders) {
      rows.push({ kind: "header", set: group.set, cardCount: group.cards.length });
    }
    for (let i = 0; i < group.cards.length; i += columns) {
      const items = group.cards.slice(i, i + columns);
      rows.push({ kind: "cards", items, cardsBefore });
      cardsBefore += items.length;
    }
  }
  return rows;
}
