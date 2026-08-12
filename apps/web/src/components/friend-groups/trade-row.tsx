import type { CardTradeResponse } from "@openrift/shared";

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

/**
 * One trade as a compact two-line row with a contextual action set: the
 * direction arrow, then the card and its value on top, everything qualifying it
 * (status, print, deadline, group) below, and the buttons for whatever it is
 * waiting on beside them. The arrow is unconditional — a flat list of rows says
 * which way each card moves (the same rule the suggestion rows follow).
 * @returns The trade row element.
 */
export function TradeRow({
  trade,
  sequence,
  groupLabel,
  redundantStatus,
}: {
  trade: CardTradeResponse;
  /** The printing ids of the block this row sits in, for the detail's prev/next. */
  sequence?: string[];
  /**
   * The group this trade lives in, when naming it tells the viewer something.
   * Hosts pass it only where the two people share more than one group.
   */
  groupLabel?: string;
  /**
   * The one state a host's own heading already says, whose badge the row then
   * drops. A section that is a status filter would otherwise repeat its heading
   * on every row it holds. Only that state is dropped, so a row that landed in
   * the section by another route (a legacy `completed` awaiting a settle, say)
   * keeps the badge that says so.
   */
  redundantStatus?: TradeBadgeState;
}) {
  const { cardsById, printingsById } = useCards();
  const { labels } = useEnumOrders();

  const card = cardsById[trade.cardId];
  const printing = printingsById[trade.printingId];
  const cardName = card?.name ?? "Card";
  const imageId = frontImageId(printing);

  const incoming = trade.role === "receiver";
  // A pending trade awaiting the viewer's accept/decline is "Your decision", not
  // "Waiting for them".
  const awaitingViewer = trade.actionNeeded === "accept-or-decline";
  const viewerSettled = trade.viewerSyncAppliedAt !== null;
  const badgeState = tradeBadgeState({ status: trade.status, awaitingViewer, viewerSettled });

  return (
    // Thumb, two-line text block, actions. The actions keep their own line when
    // the row runs out of width, which on a phone they always do; from sm up
    // they sit centered beside the text block.
    <Card className="relative flex-row flex-wrap items-center gap-x-3 gap-y-2 p-2">
      <TradeDirectionIcon incoming={incoming} />

      <CardArtThumb imageId={imageId} alt={cardName} className="w-10" loading="lazy" />

      {/* pr-8 keeps the first line clear of the overflow menu, which the settle
          actions pin to the card's top-right corner on phones; from sm up that
          menu rejoins the button row and the padding is dead weight. */}
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5 pr-8 sm:pr-0">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {/* The quantity rides along inside the control: an inline-block button
              nested in a truncating span gets clipped without an ellipsis, so
              the truncation has to live on the button itself. Only the resolved
              catalog printing can be shown, so an unknown one keeps the line as
              plain text rather than a dead control. */}
          <CardDetailNameButton
            printingId={printing?.id}
            sequence={sequence}
            className="min-w-0 truncate font-medium"
          >
            {trade.quantity}× {cardName}
          </CardDetailNameButton>
          {/* The value belongs to the card, so it rides the name line and the
              line below is left to the qualifiers. */}
          <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
            <TradeEstimatedPrice printingId={trade.printingId} quantity={trade.quantity} />
          </span>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {/* Every surface that renders these rows is already about one member,
              so the row itself never names them: no member chip, and the pending
              badge reads "Waiting for them". */}
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
              rarityLabel={labels.rarities[printing.rarity]}
              finish={printing.finish}
              finishLabel={labels.finishes[printing.finish]}
            />
          ) : null}

          <TradeExpiry status={trade.status} expiresAt={trade.expiresAt} />

          {groupLabel === undefined ? null : (
            // A badge clips rather than ellipsises on its own, so the label
            // carries the truncation.
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
