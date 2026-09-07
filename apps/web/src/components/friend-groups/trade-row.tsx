import type { CardTradeResponse } from "@openrift/shared";
import { enumLabel, getOrientation } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardDetailNameButton } from "@/components/cards/card-detail-opener";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { frontImageId } from "@/lib/card-meta";

import { TradeRowActions } from "./trade-row-actions";
import type { TradeBadgeState } from "./trade-row-parts";
import {
  CardMetaLine,
  TradeDirectionIcon,
  TradeEstimatedPrice,
  TradeExpiry,
  tradeBadgeState,
  TradeStatusBadge,
} from "./trade-row-parts";

export function TradeRow({
  trade,
  sequence,
  groupLabel,
  redundantStatus,
}: {
  trade: CardTradeResponse;
  /** The printing ids of the block this row sits in, for the detail's prev/next. */
  sequence?: string[];
  /** Pass only when the two people share more than one group. */
  groupLabel?: string;
  /** Suppresses the badge for this one status, since the host's heading already says it. */
  redundantStatus?: TradeBadgeState;
}) {
  const { cardsById, printingsById } = useCards();
  const { labels } = useEnumOrders();

  const card = cardsById[trade.cardId];
  const printing = printingsById[trade.printingId];
  const cardName = card?.name ?? "Card";
  const imageId = frontImageId(printing);

  const incoming = trade.role === "receiver";
  const awaitingViewer = trade.actionNeeded === "accept-or-decline";
  const viewerSettled = trade.viewerSyncAppliedAt !== null;
  const badgeState = tradeBadgeState({ status: trade.status, awaitingViewer, viewerSettled });

  return (
    <Card className="relative flex-row flex-wrap items-center gap-x-3 gap-y-2 p-2">
      <TradeDirectionIcon incoming={incoming} />

      <CardArtThumb
        shape="strip"
        imageId={imageId}
        alt={cardName}
        landscape={card ? getOrientation(card.types) === "landscape" : false}
        rarity={printing?.rarity}
        domains={card?.domains}
        className="h-10"
        loading="lazy"
      />

      {/* pr-8 clears the settle actions' menu, which pins to the card's top-right on phones. */}
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5 pr-8 sm:pr-0">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {/* Truncation lives on the button, not a wrapping span: a nested button
              inside a truncating span clips without an ellipsis. */}
          <CardDetailNameButton
            printingId={printing?.id}
            sequence={sequence}
            className="min-w-0 truncate font-medium"
          >
            {trade.quantity}× {cardName}
          </CardDetailNameButton>
          <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
            <TradeEstimatedPrice printingId={trade.printingId} quantity={trade.quantity} />
          </span>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {badgeState === redundantStatus ? null : (
            <TradeStatusBadge
              status={trade.status}
              awaitingViewer={awaitingViewer}
              viewerSettled={viewerSettled}
              className="min-w-0 shrink"
            />
          )}

          {printing ? (
            <CardMetaLine
              shortCode={printing.shortCode}
              rarity={printing.rarity}
              rarityLabel={enumLabel(labels.rarities, printing.rarity)}
              finish={printing.finish}
              finishLabel={enumLabel(labels.finishes, printing.finish)}
            />
          ) : null}

          <TradeExpiry status={trade.status} expiresAt={trade.expiresAt} />

          {groupLabel === undefined ? null : (
            // Badge clips without an ellipsis, so the label handles its own truncation.
            <Badge variant="outline" className="min-w-0">
              <span className="truncate">{groupLabel}</span>
            </Badge>
          )}
        </div>
      </div>

      <TradeRowActions trade={trade} cardName={cardName} />
    </Card>
  );
}
