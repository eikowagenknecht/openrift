import type { CardViewerItem } from "@/components/card-viewer-types";

export interface GroupInfo {
  id: string;
  slug: string;
  name: string;
  setType?: "main" | "supplemental";
}

/** @deprecated Use GroupInfo instead. */
export type SetInfo = GroupInfo;

/**
 * A section of cards in a viewer: its header info plus the items it contains.
 * Every grouping axis (`lib/group-by-*.ts`) returns this shape, and the grid and
 * table viewers lay it out into their own virtual rows.
 */
export interface CardGroup {
  group: GroupInfo;
  items: CardViewerItem[];
}

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
