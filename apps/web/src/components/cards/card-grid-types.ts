import type { CardViewerItem } from "@/components/card-viewer-types";

export interface GroupInfo {
  id: string;
  slug: string;
  name: string;
}

/** @deprecated Use GroupInfo instead. */
export type SetInfo = GroupInfo;

export type VRow =
  | { kind: "header"; group: GroupInfo; cardCount: number }
  | { kind: "cards"; items: CardViewerItem[]; cardsBefore: number };

export interface IndicatorState {
  cardId: string;
  indicatorTop: number;
  visible: boolean;
  dragging: boolean;
}

export interface SnapPoint {
  rowIndex: number;
  group: GroupInfo;
  screenY: number;
  cardCount: number;
  firstCardId: string;
}
