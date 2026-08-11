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

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { WishlistHeart } from "@/components/cards/wishlist-heart";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { CountPill } from "@/components/ui/count-pill";
import { Pressable } from "@/components/ui/pressable";
import type { UnidentifiedCard } from "@/hooks/use-card-scanner";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { pricesQueryOptions } from "@/hooks/use-prices";
import { useScanTrayDisclosure } from "@/hooks/use-scan-tray-disclosure";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";
import { useWishEntries } from "@/hooks/use-wish-entries";
import { formatCardId, formatterForMarketplace, priceColorClass } from "@/lib/format";
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
  /** Move one copy of the row's printing to the given finish sibling. */
  onSwitchFinish: (row: ScanSessionRow, sibling: Printing) => void;
  /** Add one more copy of the row's printing without rescanning. */
  onAddOne: (row: ScanSessionRow) => void;
  /** Remove one copy of the row's printing from the collection. */
  onRemoveOne: (row: ScanSessionRow) => void;
  /** Open the printing swap for the row (all printings of that card). */
  onChangePrinting: (row: ScanSessionRow) => void;
  /** Undo the whole session: every copy it added goes back out again. */
  onRemoveAll: () => void;
  /**
   * Commit the identify-only readings to a collection ("scan first, decide
   * later"). Absent while the session already adds as it scans.
   */
  onAddAll?: () => void;
  /**
   * The session is adding scans to a collection. False while the target is
   * "just identify", where a row names a card and stands for nothing else.
   */
  collecting: boolean;
  /**
   * Cards the scanner watched land and could not name, after the second look.
   * Each carries the picture of how it lay, which is usually enough for the
   * user to recognise it at a glance.
   */
  unidentified?: UnidentifiedCard[];
  /** Open the identify picker for one of them. */
  onIdentifyMissed?: (id: string) => void;
  /** Forget one without answering. */
  onDismissMissed?: (id: string) => void;
}

/**
 * The session log under the camera: what this scan session added, newest
 * first. Every row is already in the collection — the controls here fix the
 * exceptions (a foil pull, a mis-scan) without leaving the page.
 *
 * A row's controls do not fit beside its name on a phone, so only one row
 * shows them at a time, on a line of its own below the card. That row is the
 * newest one by default (see {@link useScanTrayDisclosure}), which is the card
 * still in the user's hand; every other row is a plain log line the user can
 * tap to correct.
 *
 * @returns The tray, or a hint while the session is still empty.
 */
export function ScanSessionTray({
  index,
  onSwitchFinish,
  onAddOne,
  onRemoveOne,
  onChangePrinting,
  onRemoveAll,
  onAddAll,
  collecting,
  unidentified = [],
  onIdentifyMissed,
  onDismissMissed,
}: ScanSessionTrayProps) {
  const rows = useScanSessionStore((state) => state.rows);
  const scans = useScanSessionStore((state) => state.scans);
  // Read once here, not per row: the hook rebuilds every enum's label map on
  // each call, and the camera pipeline wants that CPU.
  const { labels } = useEnumOrders();
  const newestFirst = [...rows.values()].toReversed();
  const { openId, toggle } = useScanTrayDisclosure(
    newestFirst.map((row) => row.printing.id),
    scans,
  );

  // What the session is worth to the user: prices, wishlist membership and
  // owned-before counts, shared by the summary line and the row badges. All
  // of it streams in without suspending — a price fetch must never blank the
  // camera page.
  const hydrated = useHydrated();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const { data: prices } = useQuery(pricesQueryOptions);
  const wish = useWishEntries(true);
  const { data: owned } = useOwnedCountsForPrintings(
    newestFirst.map((row) => row.printing.id),
    hydrated,
  );
  // Owned counts include what this session already added (the copies
  // collection is optimistic), so "owned before" subtracts the session's own
  // copies. Identify-only readings never reach the collection, so they
  // subtract nothing.
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
        <p className="text-muted-foreground">
          {collecting
            ? "Nothing scanned yet. Cards land in your collection the moment they are recognised, and show up here so you can undo or mark a foil."
            : "Nothing scanned yet. Cards you hold up will be named here, and nothing is added to your collection."}
        </p>
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
            siblings={index ? finishSiblingsOf(row.printing, index) : []}
            finishLabels={labels.finishes}
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
      {/* Below the log rather than above it: undoing the whole session is the
          last thing anyone reaches for, and a destructive button under the
          user's thumb while they scan is not what the tray is for. */}
      <div className="flex flex-wrap items-center gap-2">
        {onAddAll !== undefined && identifiedCards > 0 && (
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
  /** Same-card printings that differ only in finish, for the switch buttons. */
  siblings: Printing[];
  finishLabels: Record<string, string>;
  open: boolean;
  onToggle: (printingId: string) => void;
  onSwitchFinish: (row: ScanSessionRow, sibling: Printing) => void;
  onAddOne: (row: ScanSessionRow) => void;
  onRemoveOne: (row: ScanSessionRow) => void;
  onChangePrinting: (row: ScanSessionRow) => void;
  /** Headline price of the row's printing at the chosen marketplace, if any. */
  price?: number;
  formatValue: (value?: number | null) => string;
  /** The viewer's wish entries matching this card (empty = no heart). */
  wishEntries: WishEntryFlat[];
  /** Copies owned before this session, or null while ownership is unknown. */
  ownedBefore: number | null;
}

/**
 * One scanned card in the tray: a tappable log line, plus its corrections on a
 * second line while it is the open row.
 *
 * The line keeps its padding whether or not it is open, so opening a row never
 * shifts the rows above it out from under the user's thumb.
 *
 * @returns The tray row.
 */
function TrayRow({
  row,
  siblings,
  finishLabels,
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
          {/* Radius and clipping stay on this wrapper; the foil overlay's
              3D transform lives two levels in. Combining them on one
              element mis-sizes the overlay in Firefox. */}
          <span
            className={cn(
              "relative block h-14 w-10 shrink-0 overflow-hidden rounded",
              isFoil && "ring-1 ring-amber-400/60",
            )}
          >
            <CardArtThumb
              imageId={printing.images[0]?.imageId}
              variant="120w"
              className="size-full"
              landscape={getOrientation(printing.card.types) === "landscape"}
            />
            {/* Static rainbow, never the shimmer keyframe — the camera
                pipeline needs every frame of CPU it can get. */}
            {isFoil && <FoilOverlay active shimmer={false} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">{name}</span>
              {/* Outside the truncating span: a count that gets cut off is worse
                  than a name that does, because nothing else states it. */}
              {count > 1 && <CountPill className="shrink-0">×{count}</CountPill>}
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <span className="font-mono">{formatCardId(printing)}</span>
              <PrintingVariantLabel printing={printing} siblings={siblings} />
              {ownedBefore === 0 && (
                <span
                  className="shrink-0 text-emerald-600 dark:text-emerald-400"
                  title="None in your collection before this session"
                >
                  New
                </span>
              )}
              {ownedBefore !== null && ownedBefore > 0 && (
                <span
                  className="shrink-0 tabular-nums"
                  title="Copies in your collection before this session"
                >
                  owned {ownedBefore}
                </span>
              )}
            </span>
          </span>
        </Pressable>
        <WishlistHeart entries={wishEntries} align="end" />
        {price !== undefined && (
          <span className={cn("shrink-0 text-sm tabular-nums", priceColorClass(price))}>
            {formatValue(price)}
          </span>
        )}
      </div>
      {open && (
        <div id={actionsId} className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            render={<Link to="/cards/$cardSlug" params={{ cardSlug: printing.card.slug }} />}
            aria-label={`Open the card page for ${name}`}
          >
            <InfoIcon />
            Details
          </Button>
          {/* Identify-only readings get the same corrections as copies — a
              mis-counted or mis-finished reading skews the session summary
              just as much. The page routes each control to the store or the
              API depending on what stands behind the row. */}
          {count > 0 && (
            <>
              {siblings.map((sibling) => {
                const toFoil = sibling.finish !== WellKnown.finish.NORMAL;
                return (
                  <Button
                    key={sibling.id}
                    variant={isFoil ? "secondary" : "outline"}
                    // The button that makes a card foil carries the same amber
                    // cue as a foil thumbnail. A rainbow wash sat over the
                    // label and cost it contrast, so the ring gets it instead.
                    className={cn(toFoil && "ring-1 ring-amber-400/60")}
                    onClick={() => onSwitchFinish(row, sibling)}
                    aria-label={`Mark one ${name} as ${finishLabels[sibling.finish]}`}
                  >
                    <SparklesIcon className={cn(toFoil && "text-amber-500")} />
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

/**
 * One line answering "was there anything good in that pack": card count,
 * marketplace value, what is new to the collection and what is wished for.
 * The best pull gets its own line once the session is more than one card,
 * because that is the single number people open a pack for.
 *
 * @returns The summary block above the tray rows.
 */
function SessionSummary({
  summary,
  formatValue,
}: {
  summary: ScanSessionSummaryData;
  /** Null while prices have not loaded — the value spans stay hidden. */
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
              className="text-emerald-600 tabular-nums dark:text-emerald-400"
              title="Cards with no copy in your collection before this session"
            >
              {summary.newCards} new
            </span>
          </>
        )}
        {summary.wishedCards > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span
              className="text-rose-600 tabular-nums dark:text-rose-400"
              title="Cards on your wishlists"
            >
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

/**
 * The cards the scanner watched land and could not name.
 *
 * Shown with the frame they settled on, because that picture is what turns an
 * unhelpful "one card was missed" into something the user can answer in a
 * second: they recognise the card at a glance and tap to say what it was.
 *
 * @returns The list, or nothing when every placement was identified.
 */
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
          <span className="bg-muted block h-14 w-10 shrink-0 overflow-hidden rounded">
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
