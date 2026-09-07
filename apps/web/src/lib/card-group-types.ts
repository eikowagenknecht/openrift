import type { CardViewerItem } from "@/lib/card-viewer-types";

export interface GroupInfo {
  id: string;
  slug: string;
  name: string;
  setType?: "main" | "supplemental";
}

/**
 * Every grouping axis (`lib/group-by-*.ts`) returns this shape; the grid and
 * table viewers lay it out into their own virtual rows.
 */
export interface CardGroup {
  group: GroupInfo;
  items: CardViewerItem[];
}
