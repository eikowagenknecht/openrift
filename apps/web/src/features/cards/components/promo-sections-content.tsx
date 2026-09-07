import type { Printing } from "@openrift/shared/types/catalog";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useCardBrowserLayoutOffsets } from "@/features/cards/components/card-browser-layout";
import { CompactSection } from "@/features/cards/components/promo-compact-section";
import { FlatSection } from "@/features/cards/components/promo-flat-section";
import { LeafSection } from "@/features/cards/components/promo-leaf-section";
import { buildGridProps } from "@/features/cards/components/promo-section-grid";
import { useActiveSection } from "@/features/cards/hooks/use-active-section";
import type { CardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useResponsiveColumns } from "@/features/cards/hooks/use-responsive-columns";
import type { PromoGrouping } from "@/features/cards/lib/promo-groupings";
import type { ChannelRenderItem, FlatRenderItem } from "@/features/cards/lib/promo-sections";
import { useGridViewportStore } from "@/features/cards/stores/grid-viewport-store";
import type { DisplayMode } from "@/lib/sanitize-preferences";
import { useDisplayStore } from "@/stores/display-store";

interface PromoSectionsContentProps {
  grouping: PromoGrouping;
  channelRenderItems: ChannelRenderItem[];
  flatRenderItems: FlatRenderItem[];
  hasContent: boolean;
  hasActiveFilters: boolean;
  viewMode: DisplayMode;
  showImages: boolean;
  display: CardThumbnailDisplay;
  ownedCounts: Record<string, number> | undefined;
  onCardClick: (printing: Printing) => void;
  sortPrintings: (printings: Printing[]) => Printing[];
  setNameBySlug: Map<string, string>;
}

export function PromoSectionsContent({
  grouping,
  channelRenderItems,
  flatRenderItems,
  hasContent,
  hasActiveFilters,
  viewMode,
  showImages,
  display,
  ownedCounts,
  onCardClick,
  sortPrintings,
  setNameBySlug,
}: PromoSectionsContentProps) {
  const { stickyOffset } = useCardBrowserLayoutOffsets();

  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setMeasurements = useGridViewportStore((s) => s.setMeasurements);
  const { containerRef, columns, autoColumns, physicalMax, physicalMin, containerWidth, measured } =
    useResponsiveColumns(maxColumns);
  // Resolved once and spread onto every section grid, so the column count and
  // the gap can't drift apart between sections.
  const sectionGrid = buildGridProps(columns, containerWidth, measured);
  useEffect(() => {
    setMeasurements({ physicalMax, physicalMin, autoColumns });
  }, [autoColumns, physicalMax, physicalMin, setMeasurements]);

  const sectionEntries: { id: string; label: string; count: number }[] =
    grouping === "channel"
      ? channelRenderItems.map((item) => ({
          id: item.sectionId,
          label: item.title,
          count: item.node.localPrintingCount,
        }))
      : flatRenderItems.map((item) => ({
          id: item.sectionId,
          label: item.title,
          count: item.section.printings.length,
        }));
  const activeSectionId = useActiveSection(sectionEntries, stickyOffset);
  const activeSection = sectionEntries.find((entry) => entry.id === activeSectionId) ?? null;

  const handlePillClick = () => {
    if (!activeSection) {
      return;
    }
    // oxlint-disable-next-line prefer-query-selector -- ids derive from channel ids that may start with a digit; getElementById skips CSS-escape gymnastics.
    const el = document.getElementById(activeSection.id);
    if (!el) {
      return;
    }
    // Must land exactly at stickyOffset, matching CardGrid's scrollToGroup.
    const top = el.getBoundingClientRect().top + globalThis.scrollY - stickyOffset;
    globalThis.scrollTo({ top, behavior: "auto" });
  };

  return (
    <>
      {/* h-0 keeps the pill out of layout flow (it hovers over the first row);
          z-20 keeps it above hovered cards, which elevate to z-10. */}
      <div className="sticky z-20 h-0" style={{ top: `${stickyOffset}px` }}>
        {activeSection && (
          <div className="flex justify-center pt-2">
            <Button
              variant="glass-pill"
              className="h-auto px-3 py-1 text-sm font-normal"
              onClick={handlePillClick}
            >
              <span className="font-semibold">{activeSection.label}</span>{" "}
              <span className="text-muted-foreground tabular-nums">({activeSection.count})</span>
            </Button>
          </div>
        )}
      </div>

      {/* Single wrapper so useResponsiveColumns' ResizeObserver stays wired
          across the channel/flat branch swap below. */}
      <div ref={containerRef}>
        {hasContent ? (
          grouping === "channel" ? (
            <div className="space-y-10">
              {channelRenderItems.map((item) =>
                item.kind === "leaf" ? (
                  <LeafSection
                    key={item.sectionId}
                    item={item}
                    stickyOffset={stickyOffset}
                    viewMode={viewMode}
                    showImages={showImages}
                    display={display}
                    grid={sectionGrid}
                    onCardClick={onCardClick}
                    ownedCounts={ownedCounts}
                    sortPrintings={sortPrintings}
                    setNameBySlug={setNameBySlug}
                  />
                ) : (
                  <CompactSection
                    key={item.sectionId}
                    item={item}
                    stickyOffset={stickyOffset}
                    viewMode={viewMode}
                    showImages={showImages}
                    display={display}
                    grid={sectionGrid}
                    onCardClick={onCardClick}
                    ownedCounts={ownedCounts}
                    sortPrintings={sortPrintings}
                    setNameBySlug={setNameBySlug}
                  />
                ),
              )}
            </div>
          ) : (
            <div className="space-y-10">
              {flatRenderItems.map((item) => (
                <FlatSection
                  key={item.sectionId}
                  item={item}
                  stickyOffset={stickyOffset}
                  viewMode={viewMode}
                  showImages={showImages}
                  display={display}
                  grid={sectionGrid}
                  onCardClick={onCardClick}
                  ownedCounts={ownedCounts}
                  sortPrintings={sortPrintings}
                  setNameBySlug={setNameBySlug}
                />
              ))}
            </div>
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            {hasActiveFilters ? (
              "No promos match the current filters."
            ) : (
              <>
                No promos yet.{" "}
                <Link to="/contribute" className="text-primary hover:underline">
                  Suggest one
                </Link>
                .
              </>
            )}
          </p>
        )}
      </div>
    </>
  );
}
