import { PromoCardThumbnail } from "@/features/cards/components/promo-card-thumbnail";
import { PromoListView } from "@/features/cards/components/promo-list-view";
import { ParentAnchors, SectionDivider } from "@/features/cards/components/promo-section-divider";
import type { RenderedSectionProps } from "@/features/cards/components/promo-section-grid";
import type { ChannelRenderItem } from "@/features/cards/lib/promo-sections";

export function LeafSection({
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
}: { item: ChannelRenderItem } & RenderedSectionProps) {
  const sortedPrintings = sortPrintings(item.node.printings);
  if (sortedPrintings.length === 0) {
    return null;
  }
  return (
    <section id={item.sectionId} style={{ scrollMarginTop: `${stickyOffset}px` }}>
      <ParentAnchors ids={item.parentAnchorIds} stickyOffset={stickyOffset} />
      <SectionDivider
        title={item.title}
        count={sortedPrintings.length}
        description={item.node.channel.description}
        anchorId={item.sectionId}
      />
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
        <PromoListView
          printings={sortedPrintings}
          onRowClick={onCardClick}
          ownedCounts={ownedCounts}
          setNameBySlug={setNameBySlug}
        />
      )}
    </section>
  );
}
