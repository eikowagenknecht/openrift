import type { Printing } from "@openrift/shared";

export interface SetInfo {
  name: string;
  code: string;
}

export interface CardGroup {
  set: SetInfo;
  cards: Printing[];
}

export type VRow =
  | { kind: "header"; set: SetInfo; cardCount: number }
  | { kind: "cards"; items: Printing[] };

export function groupCardsBySet(cards: Printing[], setOrder: SetInfo[]): CardGroup[] {
  const bySet = new Map<string, Printing[]>();
  for (const printing of cards) {
    let group = bySet.get(printing.set);
    if (!group) {
      group = [];
      bySet.set(printing.set, group);
    }
    group.push(printing);
  }

  const groups: CardGroup[] = [];
  for (const setInfo of setOrder) {
    const setCards = bySet.get(setInfo.code);
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
