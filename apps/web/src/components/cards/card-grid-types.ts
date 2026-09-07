import type { GroupInfo } from "@/lib/card-group-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";

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
