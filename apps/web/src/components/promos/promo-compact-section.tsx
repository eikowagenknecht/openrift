import type { Printing } from "@openrift/shared/types/catalog";

import {
  CardTableGroupHeader,
  CardTableRow,
  getCardTableColumns,
  getCardTableMinWidth,
} from "@/components/cards/card-table-row";
import { StaticCountTableActions } from "@/components/cards/static-count-table-actions";
import { MarkdownText } from "@/components/markdown-text";
import { PromoCardThumbnail } from "@/components/promos/promo-card-thumbnail";
import { PROMO_TABLE_OPTIONS, PromoMobileCard } from "@/components/promos/promo-list-view";
import { ParentAnchors, SectionDivider } from "@/components/promos/promo-section-divider";
import type {
  RenderedSectionProps,
  SectionGridProps,
} from "@/components/promos/promo-section-grid";
import type { CardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { useEnumOrders } from "@/hooks/use-enums";
import type { ActionsColumn } from "@/lib/collection-table";
import type { ChannelRenderItem } from "@/lib/promo-sections";
import type { ChannelNode } from "@/lib/promos-tree";

export function CompactSection({
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
  return (
    <section id={item.sectionId} style={{ scrollMarginTop: `${stickyOffset}px` }}>
      <ParentAnchors ids={item.parentAnchorIds} stickyOffset={stickyOffset} />
      <SectionDivider
        title={item.title}
        // localPrintingCount dedupes printings linked to multiple sibling
        // channels; the toolbar pill uses the same source so the counts match.
        count={item.node.localPrintingCount}
        description={item.node.channel.description}
        anchorId={item.sectionId}
      />
      {viewMode === "table" ? (
        <CompactBranchTable
          node={item.node}
          stickyOffset={stickyOffset}
          onCardClick={onCardClick}
          ownedCounts={ownedCounts}
          sortPrintings={sortPrintings}
          setNameBySlug={setNameBySlug}
        />
      ) : (
        <CompactBranchGrid
          node={item.node}
          stickyOffset={stickyOffset}
          showImages={showImages}
          display={display}
          grid={grid}
          onCardClick={onCardClick}
          ownedCounts={ownedCounts}
          sortPrintings={sortPrintings}
        />
      )}
    </section>
  );
}

function CompactBranchGrid({
  node,
  stickyOffset,
  showImages,
  display,
  grid,
  onCardClick,
  ownedCounts,
  sortPrintings,
}: {
  node: ChannelNode;
  stickyOffset: number;
  showImages: boolean;
  display: CardThumbnailDisplay;
  grid: SectionGridProps;
  onCardClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  sortPrintings: (printings: Printing[]) => Printing[];
}) {
  const entries = node.children.flatMap((child) =>
    sortPrintings(child.printings).map((printing, printingIndex) => ({
      printing,
      leafLabel: child.channel.label,
      anchorId:
        printingIndex === 0 ? `lang-${printing.language}-ch-${child.channel.id}` : undefined,
    })),
  );
  const legend = node.children.filter(
    (child) => child.channel.description && child.printings.length > 0,
  );
  return (
    <>
      {legend.length > 0 && (
        <dl className="mx-auto mb-3 max-w-2xl space-y-0.5 text-center text-sm">
          {legend.map((child) => (
            <div
              key={child.channel.id}
              className="flex flex-wrap items-baseline justify-center gap-x-2"
            >
              <dt className="font-semibold">{child.channel.label}</dt>
              <dd className="text-muted-foreground min-w-0">
                <MarkdownText text={child.channel.description ?? ""} links="any" />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div {...grid}>
        {entries.map(({ printing, leafLabel, anchorId }) => (
          <div
            key={`${leafLabel}-${printing.id}`}
            id={anchorId}
            style={anchorId ? { scrollMarginTop: `${stickyOffset}px` } : undefined}
          >
            <div className="mb-1 px-1.5 font-semibold">{leafLabel}</div>
            <PromoCardThumbnail
              printing={printing}
              showImages={showImages}
              display={display}
              ownedCounts={ownedCounts}
              onClick={onCardClick}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function CompactBranchTable({
  node,
  stickyOffset,
  onCardClick,
  ownedCounts,
  sortPrintings,
  setNameBySlug,
}: {
  node: ChannelNode;
  stickyOffset: number;
  onCardClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  sortPrintings: (printings: Printing[]) => Printing[];
  setNameBySlug: Map<string, string>;
}) {
  const { labels } = useEnumOrders();
  const actionsColumn: ActionsColumn = ownedCounts === undefined ? "none" : "narrow";
  const columns = getCardTableColumns(actionsColumn, undefined, PROMO_TABLE_OPTIONS);
  const minWidth = getCardTableMinWidth(actionsColumn, undefined, PROMO_TABLE_OPTIONS);
  const branches = node.children.flatMap((child) => {
    const printings = sortPrintings(child.printings);
    const [firstPrinting] = printings;
    return firstPrinting ? [{ child, printings, firstPrinting }] : [];
  });
  if (branches.length === 0) {
    return null;
  }
  const multipleBranches = branches.length > 1;
  return (
    <>
      {/* Tracks are fixed px, so the wrapper scrolls sideways on narrow desktops
          rather than letting rows spill past the content column. */}
      <div className="hidden overflow-x-auto overflow-y-clip md:block">
        <div style={{ minWidth }}>
          {branches.map(({ child, printings, firstPrinting }) => {
            const anchorId = `lang-${firstPrinting.language}-ch-${child.channel.id}`;
            return (
              <div
                key={child.channel.id}
                id={anchorId}
                style={{ scrollMarginTop: `${stickyOffset}px` }}
              >
                {multipleBranches && (
                  <CardTableGroupHeader
                    columns={columns}
                    name={child.channel.label}
                    count={printings.length}
                    anchorId={anchorId}
                  />
                )}
                {printings.map((printing) => (
                  <CardTableRow
                    key={printing.id}
                    printing={printing}
                    actionsColumn={actionsColumn}
                    columns={columns}
                    cardTypeLabels={labels.cardTypes}
                    superTypeLabels={labels.superTypes}
                    rarityLabels={labels.rarities}
                    setNameBySlug={setNameBySlug}
                    options={PROMO_TABLE_OPTIONS}
                    onRowClick={onCardClick}
                    actionsCell={
                      ownedCounts ? (
                        <StaticCountTableActions count={ownedCounts[printing.id] ?? 0} />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 md:hidden">
        {branches.map(({ child, printings, firstPrinting }) => {
          const anchorId = `lang-${firstPrinting.language}-ch-${child.channel.id}`;
          return (
            <div
              key={child.channel.id}
              id={anchorId}
              style={{ scrollMarginTop: `${stickyOffset}px` }}
            >
              {multipleBranches && <div className="mb-2 font-semibold">{child.channel.label}</div>}
              <div className="flex flex-col gap-2">
                {printings.map((printing) => (
                  <PromoMobileCard
                    key={printing.id}
                    printing={printing}
                    ownedCount={ownedCounts?.[printing.id] ?? 0}
                    showOwnedCount={ownedCounts !== undefined}
                    onClick={onCardClick}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
