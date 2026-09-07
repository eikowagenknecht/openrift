import type { Printing } from "@openrift/shared";
import { WellKnown, getOrientation, legendDisplayName } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRightIcon,
  FolderPlusIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useId } from "react";

import { useOpenCardDetail } from "@/components/cards/card-detail-opener";
import { CardMiniRow } from "@/components/cards/card-mini-row";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { WishlistHeart } from "@/components/cards/wishlist-heart";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { CountPill } from "@/components/ui/count-pill";
import { Pressable } from "@/components/ui/pressable";
import type { UnidentifiedCard } from "@/hooks/use-card-scanner";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { pricesQueryOptions } from "@/hooks/use-prices";
import { useScanTrayDisclosure } from "@/hooks/use-scan-tray-disclosure";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";
import { useWishEntries } from "@/hooks/use-wish-entries";
import { frontImageId } from "@/lib/card-meta";
import { formatterForMarketplace, priceColorClass } from "@/lib/format";
import type { ScanPrintingIndex } from "@/lib/scan-resolve";
import { finishSiblingsOf } from "@/lib/scan-resolve";
import type { ScanSessionSummaryData } from "@/lib/scan-session-summary";
import { computeScanSessionSummary } from "@/lib/scan-session-summary";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import type { ScanSessionRow } from "@/stores/scan-session-store";
import { sessionCountOf, useScanSessionStore } from "@/stores/scan-session-store";

interface ScanSessionTrayProps {
  index: ScanPrintingIndex | null;
  onSwitchFinish: (row: ScanSessionRow, sibling: Printing) => void;
  onAddOne: (row: ScanSessionRow) => void;
  onRemoveOne: (row: ScanSessionRow) => void;
  onChangePrinting: (row: ScanSessionRow) => void;
  onRemoveAll: () => void;
  onAddAll: () => void;
  unidentified?: UnidentifiedCard[];
  onIdentifyMissed?: (id: string) => void;
  onDismissMissed?: (id: string) => void;
}

export function ScanSessionTray({
  index,
  onSwitchFinish,
  onAddOne,
  onRemoveOne,
  onChangePrinting,
  onRemoveAll,
  onAddAll,
  unidentified = [],
  onIdentifyMissed,
  onDismissMissed,
}: ScanSessionTrayProps) {
  const rows = useScanSessionStore((state) => state.rows);
  const scans = useScanSessionStore((state) => state.scans);
  // Read once here, not per row: the hook rebuilds every enum's label map on
  // each call, and the camera pipeline wants that CPU.
  const { labels } = useEnumOrders();
  const domainColors = useDomainColors();
  const newestFirst = [...rows.values()].toReversed();
  // Also the order the detail overlay's prev/next steps through.
  const sequence = newestFirst.map((row) => row.printing.id);
  const { openId, toggle } = useScanTrayDisclosure(sequence, scans);

  // Streams in without suspending: a price fetch must never blank the camera page.
  const hydrated = useHydrated();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const { data: prices } = useQuery(pricesQueryOptions);
  const wish = useWishEntries(true);
  const { data: owned } = useOwnedCountsForPrintings(sequence, hydrated);
  // Owned counts include what this session already added, so "owned before"
  // subtracts the session's own copies.
  const ownedBefore = owned
    ? new Map(
        newestFirst.map((row) => [
          row.printing.id,
          Math.max(0, (owned.allTotals[row.printing.id] ?? 0) - row.copyIds.length),
        ]),
      )
    : null;
  const formatValue = formatterForMarketplace(marketplace);
  const summary = computeScanSessionSummary(
    newestFirst.map((row) => ({ printing: row.printing, count: sessionCountOf(row) })),
    {
      priceOf: (printingId) => prices?.get(printingId, marketplace),
      isWished: wish.matches,
      ownedBefore: ownedBefore ? (printingId) => ownedBefore.get(printingId) ?? 0 : null,
    },
  );

  if (rows.size === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">Nothing scanned yet.</p>
        <UnidentifiedList
          cards={unidentified}
          onIdentify={onIdentifyMissed}
          onDismiss={onDismissMissed}
        />
      </div>
    );
  }

  const addedCopies = newestFirst.some((row) => row.copyIds.length > 0);
  const identifiedCards = newestFirst.reduce((sum, row) => sum + row.identifiedCount, 0);

  return (
    <div className="flex flex-col gap-2">
      <SessionSummary summary={summary} formatValue={prices ? formatValue : null} />
      <UnidentifiedList
        cards={unidentified}
        onIdentify={onIdentifyMissed}
        onDismiss={onDismissMissed}
      />
      <ul className="flex flex-col">
        {newestFirst.map((row) => (
          <TrayRow
            key={row.printing.id}
            row={row}
            sequence={sequence}
            siblings={index ? finishSiblingsOf(row.printing, index) : []}
            finishLabels={labels.finishes}
            rarityLabels={labels.rarities}
            domainColors={domainColors}
            open={openId === row.printing.id}
            onToggle={toggle}
            onSwitchFinish={onSwitchFinish}
            onAddOne={onAddOne}
            onRemoveOne={onRemoveOne}
            onChangePrinting={onChangePrinting}
            price={prices?.get(row.printing.id, marketplace)}
            formatValue={formatValue}
            wishEntries={wish.entriesForPrinting(row.printing.cardId, row.printing.id)}
            ownedBefore={ownedBefore ? (ownedBefore.get(row.printing.id) ?? 0) : null}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {identifiedCards > 0 && (
          <Button onClick={onAddAll}>
            <FolderPlusIcon />
            Add all to a collection
          </Button>
        )}
        <Button variant="outline" onClick={onRemoveAll}>
          <Trash2Icon />
          {addedCopies ? "Remove all scanned cards" : "Clear the list"}
        </Button>
      </div>
    </div>
  );
}

interface TrayRowProps {
  row: ScanSessionRow;
  sequence: string[];
  siblings: Printing[];
  finishLabels: Record<string, string>;
  rarityLabels: Record<string, string>;
  domainColors: Record<string, string>;
  open: boolean;
  onToggle: (printingId: string) => void;
  onSwitchFinish: (row: ScanSessionRow, sibling: Printing) => void;
  onAddOne: (row: ScanSessionRow) => void;
  onRemoveOne: (row: ScanSessionRow) => void;
  onChangePrinting: (row: ScanSessionRow) => void;
  price?: number;
  formatValue: (value?: number | null) => string;
  wishEntries: WishEntryFlat[];
  ownedBefore: number | null;
}

function TrayRow({
  row,
  sequence,
  siblings,
  finishLabels,
  rarityLabels,
  domainColors,
  open,
  onToggle,
  onSwitchFinish,
  onAddOne,
  onRemoveOne,
  onChangePrinting,
  price,
  formatValue,
  wishEntries,
  ownedBefore,
}: TrayRowProps) {
  const actionsId = useId();
  const openCardDetail = useOpenCardDetail();
  const printing = row.printing;
  const name = legendDisplayName(printing.card);
  const isFoil = printing.finish !== WellKnown.finish.NORMAL;
  const count = sessionCountOf(row);

  return (
    <li className={cn("-mx-2 rounded-md px-2 py-2", open && "bg-muted/50")}>
      {/* The heart is a popover trigger, so it must sit beside the pressable
          log line, never inside it — nested buttons are invalid markup. */}
      <div className="flex w-full items-center gap-2">
        <Pressable
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md"
          aria-expanded={open}
          // Only while open: the panel is unmounted when closed, and pointing
          // aria-controls at an absent id is worse than omitting it.
          aria-controls={open ? actionsId : undefined}
          onClick={() => onToggle(printing.id)}
        >
          <CardMiniRow
            className="self-stretch"
            imageId={frontImageId(printing)}
            landscape={getOrientation(printing.card.types) === "landscape"}
            domains={printing.card.domains}
            domainColors={domainColors}
            rarity={printing.rarity}
            rarityLabels={rarityLabels}
            shortCode={printing.shortCode}
            foil={isFoil}
            artClassName="h-10"
            hideMetaOnMobile
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">{name}</span>
              {count > 1 && <CountPill className="shrink-0">×{count}</CountPill>}
            </span>
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
              <span className="font-mono sm:hidden">{printing.shortCode}</span>
              <PrintingVariantLabel printing={printing} siblings={siblings} />
            </span>
          </span>
        </Pressable>
        <WishlistHeart entries={wishEntries} align="end" />
        {ownedBefore === 0 && (
          <span
            className="text-success shrink-0 text-sm"
            title="None in your collection before this session"
          >
            New
          </span>
        )}
        {ownedBefore !== null && ownedBefore > 0 && (
          <span
            className="text-muted-foreground shrink-0 text-sm tabular-nums"
            title="Copies in your collection before this session"
          >
            {ownedBefore} owned
          </span>
        )}
        {price !== undefined && (
          <span className={cn("shrink-0 text-sm tabular-nums", priceColorClass(price))}>
            {formatValue(price)}
          </span>
        )}
      </div>
      {open && (
        <div id={actionsId} className="mt-2 flex flex-wrap items-center gap-2">
          {/* Opens over the page: leaving for the card page would end a running
              camera session. Falls back to the card page if there's no provider. */}
          {openCardDetail ? (
            <Button
              variant="outline"
              onClick={() => openCardDetail({ printingId: printing.id, sequence })}
              aria-label={`Show details for ${name}`}
            >
              <InfoIcon />
              Details
            </Button>
          ) : (
            <Button
              variant="outline"
              render={<Link to="/cards/$cardSlug" params={{ cardSlug: printing.card.slug }} />}
              aria-label={`Open the card page for ${name}`}
            >
              <InfoIcon />
              Details
            </Button>
          )}
          {count > 0 && (
            <>
              {siblings.map((sibling) => {
                const toFoil = sibling.finish !== WellKnown.finish.NORMAL;
                return (
                  <Button
                    key={sibling.id}
                    variant={isFoil ? "secondary" : "outline"}
                    className={cn(toFoil && "ring-border-accent/60 ring-1")}
                    onClick={() => onSwitchFinish(row, sibling)}
                    aria-label={`Mark one ${name} as ${finishLabels[sibling.finish]}`}
                  >
                    <SparklesIcon className={cn(toFoil && "text-border-accent")} />
                    {finishLabels[sibling.finish]}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                onClick={() => onChangePrinting(row)}
                aria-label={`Change the printing of ${name}`}
              >
                <ArrowLeftRightIcon />
                Printing
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onRemoveOne(row)}
                  aria-label={`Remove one ${name}`}
                >
                  <MinusIcon />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onAddOne(row)}
                  aria-label={`Add another ${name}`}
                >
                  <PlusIcon />
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function SessionSummary({
  summary,
  formatValue,
}: {
  summary: ScanSessionSummaryData;
  formatValue: ((value?: number | null) => string) | null;
}) {
  const bestName = summary.best ? legendDisplayName(summary.best.printing.card) : null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium tabular-nums">
          {summary.cards} {summary.cards === 1 ? "card" : "cards"}
        </span>
        {formatValue !== null && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium tabular-nums">{formatValue(summary.totalValue)}</span>
            {summary.unpricedCards > 0 && (
              <span className="text-muted-foreground text-xs">
                ({summary.unpricedCards} without price data)
              </span>
            )}
          </>
        )}
        {summary.newCards !== null && summary.newCards > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span
              className="text-success tabular-nums"
              title="Cards with no copy in your collection before this session"
            >
              {summary.newCards} new
            </span>
          </>
        )}
        {summary.wishedCards > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-destructive tabular-nums" title="Cards on your wishlists">
              {summary.wishedCards} wished
            </span>
          </>
        )}
      </p>
      {formatValue !== null && summary.best !== null && summary.cards > 1 && (
        <p className="text-muted-foreground text-sm">
          Best pull: {bestName}{" "}
          <span className={cn("tabular-nums", priceColorClass(summary.best.value))}>
            {formatValue(summary.best.value)}
          </span>
        </p>
      )}
    </div>
  );
}

function UnidentifiedList({
  cards,
  onIdentify,
  onDismiss,
}: {
  cards: UnidentifiedCard[];
  onIdentify?: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
  if (cards.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-2">
      {cards.map((card) => (
        <li key={card.id} className="flex items-center gap-3">
          <span className="bg-muted block h-14 w-10 shrink-0 overflow-hidden rounded-md">
            {card.thumbnail !== null && (
              <img src={card.thumbnail} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Not recognised</span>
            <span className="text-muted-foreground block text-sm">
              This card was scanned but not identified.
            </span>
          </span>
          <Button size="sm" onClick={() => onIdentify?.(card.id)}>
            Identify
          </Button>
          <ChipRemoveButton
            aria-label="Dismiss unidentified card"
            onClick={() => onDismiss?.(card.id)}
          />
        </li>
      ))}
    </ul>
  );
}
