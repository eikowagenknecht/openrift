import type { Printing } from "@openrift/shared";

export interface SetInfo {
  id: string;
  slug: string;
  name: string;
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
