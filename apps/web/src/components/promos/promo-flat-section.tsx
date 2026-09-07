import { PromoCardThumbnail } from "@/components/promos/promo-card-thumbnail";
import { PromoListView } from "@/components/promos/promo-list-view";
import { SectionDivider } from "@/components/promos/promo-section-divider";
import type { RenderedSectionProps } from "@/components/promos/promo-section-grid";
import type { FlatRenderItem } from "@/lib/promo-sections";

export function FlatSection({
  item,
  stickyOffset,
  viewMode,
  showImages,
  display,
  grid,
  onCardClick,
  ownedCounts,
  sortPrintings,
  setNameBySlug,
}: { item: FlatRenderItem } & RenderedSectionProps) {
  const sortedPrintings = sortPrintings(item.section.printings);
  if (sortedPrintings.length === 0) {
    return null;
  }
  return (
    <section id={item.sectionId} style={{ scrollMarginTop: `${stickyOffset}px` }}>
      <SectionDivider title={item.title} count={sortedPrintings.length} anchorId={item.sectionId} />
      {viewMode === "grid" ? (
        <div {...grid}>
          {sortedPrintings.map((printing) => (
            <PromoCardThumbnail
              key={printing.id}
              printing={printing}
              showImages={showImages}
              display={display}
              ownedCounts={ownedCounts}
              onClick={onCardClick}
            />
          ))}
        </div>
      ) : (
        // Card / year / marker sections say nothing about where a printing came
        // from, so the rows carry the channel themselves.
        <PromoListView
          printings={sortedPrintings}
          onRowClick={onCardClick}
          ownedCounts={ownedCounts}
          setNameBySlug={setNameBySlug}
          showChannel
        />
      )}
    </section>
  );
}
