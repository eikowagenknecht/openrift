import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import type { CardTableColumnOptions } from "@/components/cards/card-table-row";
import {
  CardTableRow,
  getCardTableColumns,
  getCardTableMinWidth,
} from "@/components/cards/card-table-row";
import { FinishIcon } from "@/components/cards/finish-icon";
import { PrintingChannelCell } from "@/components/cards/printing-channel-cell";
import { PrintingNotesCell } from "@/components/cards/printing-notes-cell";
import { StaticCountTableActions } from "@/components/cards/static-count-table-actions";
import { Pressable } from "@/components/ui/pressable";
import { useEnumOrders } from "@/hooks/use-enums";
import type { ActionsColumn } from "@/lib/collection-table";

export const PROMO_TABLE_OPTIONS: CardTableColumnOptions = {
  columns: ["image", "name", "notes"],
  stretch: "notes",
};

const PROMO_TABLE_OPTIONS_WITH_CHANNEL: CardTableColumnOptions = {
  columns: ["image", "name", "channel", "notes"],
  stretch: "channel",
};

export function PromoListView({
  printings,
  onRowClick,
  ownedCounts,
  setNameBySlug,
  showChannel,
}: {
  printings: Printing[];
  onRowClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  setNameBySlug: Map<string, string>;
  showChannel?: boolean;
}) {
  const { labels } = useEnumOrders();
  const actionsColumn: ActionsColumn = ownedCounts === undefined ? "none" : "narrow";
  const tableOptions = showChannel ? PROMO_TABLE_OPTIONS_WITH_CHANNEL : PROMO_TABLE_OPTIONS;
  const columns = getCardTableColumns(actionsColumn, undefined, tableOptions);
  const minWidth = getCardTableMinWidth(actionsColumn, undefined, tableOptions);
  return (
    <>
      {/* Desktop: shared CardTable layout. Tracks are fixed px, so the wrapper
          scrolls sideways rather than letting rows spill past the content column. */}
      <div className="hidden overflow-x-auto overflow-y-clip md:block">
        <div style={{ minWidth }}>
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
              options={tableOptions}
              onRowClick={onRowClick}
              actionsCell={
                ownedCounts ? (
                  <StaticCountTableActions count={ownedCounts[printing.id] ?? 0} />
                ) : undefined
              }
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {printings.map((printing) => (
          <PromoMobileCard
            key={printing.id}
            printing={printing}
            ownedCount={ownedCounts?.[printing.id] ?? 0}
            showOwnedCount={ownedCounts !== undefined}
            showChannel={showChannel}
            onClick={onRowClick}
          />
        ))}
      </div>
    </>
  );
}

// The note holds source links, so its click target is a stretched Pressable
// behind the content, with the note rising above it to keep its links clickable.
export function PromoMobileCard({
  printing,
  ownedCount,
  showOwnedCount,
  showChannel,
  onClick,
}: {
  printing: Printing;
  ownedCount: number;
  showOwnedCount: boolean;
  showChannel?: boolean;
  onClick: (printing: Printing) => void;
}) {
  const image = printing.images[0];
  const cardName = legendDisplayName(printing.card);
  return (
    <div className="hover:bg-muted/50 relative flex w-full items-start gap-3 rounded-lg border p-2">
      <CardArtThumb imageId={image?.imageId} variant="400w" alt={cardName} className="h-20" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate font-medium">{cardName}</div>
          {showOwnedCount && ownedCount > 0 && (
            <span className="text-muted-foreground shrink-0 tabular-nums">&times;{ownedCount}</span>
          )}
        </div>
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground flex items-center gap-1">
            <span className="truncate tabular-nums">{printing.publicCode}</span>
            <FinishIcon finish={printing.finish} className="shrink-0" />
          </div>
          {showChannel && <PrintingChannelCell channels={printing.distributionChannels} />}
          <PrintingNotesCell
            comment={printing.comment}
            markers={printing.markers}
            citations={printing.citations ?? []}
            className="relative z-10"
          />
        </div>
      </div>
      <Pressable
        aria-label={cardName}
        onClick={() => onClick(printing)}
        className="absolute inset-0 rounded-lg"
      />
    </div>
  );
}
