import type { Printing } from "@openrift/shared/types/catalog";
import type { CSSProperties } from "react";

import type { CardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { SSR_RESPONSIVE_GRID_COLS, SSR_RESPONSIVE_GRID_GAP } from "@/hooks/use-responsive-columns";
import { computeGridMetrics } from "@/lib/card-grid-metrics";
import type { DisplayMode } from "@/lib/sanitize-preferences";
import { cn } from "@/lib/utils";

export interface SectionGridProps {
  className: string;
  style: CSSProperties;
}

export interface RenderedSectionProps {
  stickyOffset: number;
  viewMode: DisplayMode;
  showImages: boolean;
  display: CardThumbnailDisplay;
  grid: SectionGridProps;
  onCardClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  sortPrintings: (printings: Printing[]) => Printing[];
  setNameBySlug: Map<string, string>;
}

// Pre-measurement uses container-query Tailwind classes so SSR HTML matches
// the eventual column count; post-measurement switches to inline `gridTemplateColumns`.
export function buildGridProps(
  columns: number,
  containerWidth: number,
  measured: boolean,
): SectionGridProps {
  if (!measured) {
    return {
      className: cn("grid", SSR_RESPONSIVE_GRID_COLS, SSR_RESPONSIVE_GRID_GAP),
      style: {},
    };
  }
  return {
    className: "grid",
    style: {
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: `${computeGridMetrics(containerWidth, columns).gap}px`,
    },
  };
}
