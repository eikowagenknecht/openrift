import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";
import { getOrientation, legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronDownIcon,
  FolderPlusIcon,
  InboxIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

import { useOpenCardDetail } from "@/components/cards/card-detail-opener";
import { CardMiniRow } from "@/components/cards/card-mini-row";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { WishlistHeart } from "@/components/cards/wishlist-heart";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Callout } from "@/components/ui/callout";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { CountPill } from "@/components/ui/count-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pressable } from "@/components/ui/pressable";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import { pricesQueryOptions } from "@/hooks/use-prices";
import { useScanTrayDisclosure } from "@/hooks/use-scan-tray-disclosure";
import { useWishEntries } from "@/hooks/use-wish-entries";
import { frontImageId } from "@/lib/card-meta";
import { formatterForMarketplace, priceColorClass } from "@/lib/format";
import type { UnidentifiedCard } from "@/lib/scan-catchup";
import type { ScanPrintingIndex } from "@/lib/scan-resolve";
import { finishSiblingsOf } from "@/lib/scan-resolve";
import type { ScanSessionSummaryData } from "@/lib/scan-session-summary";
import { computeScanSessionSummary } from "@/lib/scan-session-summary";
import { cn } from "@/lib/utils";
import type { WishEntryFlat } from "@/lib/wish-entry";
import { useDisplayStore } from "@/stores/display-store";
import type { ScanSessionRow } from "@/stores/scan-session-store";
import { useScanSessionStore } from "@/stores/scan-session-store";

interface ScanSessionTrayProps {
  index: ScanPrintingIndex | null;
  collections: CollectionResponse[];
  destination: CollectionResponse | null;
  adding: boolean;
  failedCount: number;
  compact: boolean;
  resumed: boolean;
  notice?: ReactNode;
  onAddOne: (row: ScanSessionRow) => void;
  onRemoveOne: (row: ScanSessionRow) => void;
  onChangePrinting: (row: ScanSessionRow) => void;
  onClear: () => void;
  onAddAll: (collectionId: string) => void;
  unidentified?: UnidentifiedCard[];
  onIdentifyMissed?: (id: string) => void;
  onDismissMissed?: (id: string) => void;
}

function cardWord(count: number): string {
  return count === 1 ? "card" : "cards";
}

export function ScanSessionTray({
  index,
  collections,
  destination,
  adding,
  failedCount,
  compact,
  resumed,
  notice,
  onAddOne,
  onRemoveOne,
  onChangePrinting,
  onClear,
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
  const ownedTotals = owned
    ? new Map(newestFirst.map((row) => [row.printing.id, owned.allTotals[row.printing.id] ?? 0]))
    : null;
  const formatValue = formatterForMarketplace(marketplace);
  const summary = computeScanSessionSummary(newestFirst, {
    priceOf: (printingId) => prices?.get(printingId, marketplace),
    isWished: wish.matches,
    ownedBefore: ownedTotals ? (printingId) => ownedTotals.get(printingId) ?? 0 : null,
  });

  let headPrefix: string | null = "Scanned this session";
  if (compact) {
    headPrefix = null;
  } else if (resumed) {
    headPrefix = "Scanned earlier";
  }

  const footer = (
    <TrayFooter
      collections={collections}
      destination={destination}
      count={summary.cards}
      adding={adding}
      failedCount={failedCount}
      compact={compact}
      onAddAll={onAddAll}
    />
  );

  if (rows.size === 0) {
    return (
      <div className="flex min-h-0 flex-auto flex-col gap-2">
        <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain pt-1">
          <p className="font-medium">Nothing scanned yet</p>
          <p className="text-muted-foreground">
            Scanned cards appear here. Add them to a collection when you are done.
          </p>
          <UnidentifiedList
            cards={unidentified}
            onIdentify={onIdentifyMissed}
            onDismiss={onDismissMissed}
          />
        </div>
        {footer}
      </div>
    );
  }

  const renderRow = (row: ScanSessionRow) => (
    <TrayRow
      key={row.printing.id}
      row={row}
      sequence={sequence}
      siblings={index ? finishSiblingsOf(row.printing, index) : []}
      rarityLabels={labels.rarities}
      domainColors={domainColors}
      open={openId === row.printing.id}
      onToggle={toggle}
      onAddOne={onAddOne}
      onRemoveOne={onRemoveOne}
      onChangePrinting={onChangePrinting}
      price={prices?.get(row.printing.id, marketplace)}
      formatValue={formatValue}
      wishEntries={wish.entriesForPrinting(row.printing.cardId, row.printing.id)}
      owned={ownedTotals ? (ownedTotals.get(row.printing.id) ?? 0) : null}
    />
  );

  const head = (
    <div className="flex items-baseline gap-2 pt-1">
      <SummaryHead
        summary={summary}
        formatValue={prices ? formatValue : null}
        prefix={headPrefix}
        showNew={compact}
      />
      <Button variant="link-muted" size="sm" className="ml-auto shrink-0" onClick={onClear}>
        Clear
      </Button>
    </div>
  );

  const facts = (
    <SummaryFacts summary={summary} formatValue={prices ? formatValue : null} showNew={!compact} />
  );

  const alerts = (
    <>
      {notice}
      {failedCount > 0 && (
        <Callout className="border-warning mb-2 p-3">
          <p className="flex items-center gap-2">
            <TriangleAlertIcon className="text-warning size-4 shrink-0" />
            Could not add {failedCount} {cardWord(failedCount)}. They stay in the list.
          </p>
        </Callout>
      )}
      <UnidentifiedList
        cards={unidentified}
        onIdentify={onIdentifyMissed}
        onDismiss={onDismissMissed}
      />
    </>
  );

  // The drawer peek shows only the top of the sheet, so on the phone the
  // footer sits above the older rows instead of at the sheet's bottom.
  if (compact) {
    const [newest, ...older] = newestFirst;
    return (
      <div className="flex min-h-0 flex-auto flex-col gap-2">
        {head}
        <ul className="-mx-2 flex flex-col">{newest && renderRow(newest)}</ul>
        {footer}
        <div className="-mx-2 min-h-0 flex-auto overflow-x-hidden overflow-y-auto overscroll-contain px-2 [&:has(>*)]:border-t [&:has(>*)]:pt-2">
          {facts}
          {alerts}
          {older.length > 0 && (
            <ul className="-mx-2 flex flex-col">{older.map((row) => renderRow(row))}</ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-auto flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-0.5">
        {head}
        {facts}
      </div>

      <div className="-mx-2 min-h-0 flex-auto overflow-x-hidden overflow-y-auto overscroll-contain px-2">
        {alerts}
        <ul className="-mx-2 flex flex-col">{newestFirst.map((row) => renderRow(row))}</ul>
      </div>

      {footer}
    </div>
  );
}

interface TrayFooterProps {
  collections: CollectionResponse[];
  destination: CollectionResponse | null;
  count: number;
  adding: boolean;
  failedCount: number;
  compact: boolean;
  onAddAll: (collectionId: string) => void;
}

function TrayFooter({
  collections,
  destination,
  count,
  adding,
  failedCount,
  compact,
  onAddAll,
}: TrayFooterProps) {
  const destinationName = destination?.name ?? "a collection";
  let label = `Add ${count} ${cardWord(count)} to ${destinationName}`;
  if (count === 0) {
    label = `Add to ${destinationName}`;
  } else if (adding) {
    label = `Adding ${count} ${cardWord(count)}…`;
  } else if (failedCount > 0) {
    label = `Retry adding ${count} ${cardWord(count)}`;
  }
  const disabled = adding || count === 0 || destination === null;

  return (
    <div className={cn("flex shrink-0 flex-col gap-2 pt-2", !compact && "mt-auto")}>
      <ButtonGroup className="w-full">
        <Button
          variant={count === 0 ? "outline" : "default"}
          className="min-w-0 flex-1"
          disabled={disabled}
          onClick={() => destination && onAddAll(destination.id)}
        >
          <FolderPlusIcon />
          <span className="truncate">{label}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant={count === 0 ? "outline" : "default"}
                size="icon"
                disabled={disabled}
                aria-label="Pick another collection"
              />
            }
          >
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                Add the {count} {cardWord(count)} to
              </DropdownMenuLabel>
              {collections.map((collection) => (
                <DropdownMenuItem key={collection.id} onClick={() => onAddAll(collection.id)}>
                  {collection.isInbox && <InboxIcon className="size-4" />}
                  <span className="truncate">{collection.name}</span>
                  {collection.id === destination?.id && <CheckIcon className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      {!compact && (
        <p className="text-muted-foreground text-sm">
          The list stays on this device until you add it to a collection.
        </p>
      )}
    </div>
  );
}

interface TrayRowProps {
  row: ScanSessionRow;
  sequence: string[];
  siblings: Printing[];
  rarityLabels: Record<string, string>;
  domainColors: Record<string, string>;
  open: boolean;
  onToggle: (printingId: string) => void;
  onAddOne: (row: ScanSessionRow) => void;
  onRemoveOne: (row: ScanSessionRow) => void;
  onChangePrinting: (row: ScanSessionRow) => void;
  price?: number;
  formatValue: (value?: number | null) => string;
  wishEntries: WishEntryFlat[];
  owned: number | null;
}

function TrayRow({
  row,
  sequence,
  siblings,
  rarityLabels,
  domainColors,
  open,
  onToggle,
  onAddOne,
  onRemoveOne,
  onChangePrinting,
  price,
  formatValue,
  wishEntries,
  owned,
}: TrayRowProps) {
  const actionsId = useId();
  const openCardDetail = useOpenCardDetail();
  const printing = row.printing;
  const name = legendDisplayName(printing.card);
  const isFoil = printing.finish !== WellKnown.finish.NORMAL;
  const count = row.count;

  return (
    <li className={cn("relative rounded-md px-2 py-2", open && "bg-muted/50")}>
      {/* Nested buttons are invalid. */}
      <Pressable
        className="absolute inset-0 rounded-md"
        aria-expanded={open}
        // The panel is unmounted when closed, so its id does not exist yet.
        aria-controls={open ? actionsId : undefined}
        aria-label={`Show actions for ${name}`}
        onClick={() => onToggle(printing.id)}
      />
      <div className="pointer-events-none relative flex w-full items-center gap-2">
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
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="flex w-full items-center gap-2">
            <span className="truncate font-medium">{name}</span>
            {count > 1 && <CountPill className="shrink-0">×{count}</CountPill>}
          </span>
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
            <span className="font-mono sm:hidden">{printing.shortCode}</span>
            <Button
              variant="outline"
              size="xs"
              className="pointer-events-auto max-w-full"
              onClick={() => onChangePrinting(row)}
              aria-label={`Change the printing of ${name}`}
            >
              <span className="truncate">
                <PrintingVariantLabel printing={printing} siblings={siblings} />
              </span>
              <ChevronDownIcon />
            </Button>
          </span>
        </span>
        <span className="pointer-events-auto">
          <WishlistHeart entries={wishEntries} align="end" />
        </span>
        {owned === 0 && (
          <span className="text-success shrink-0 text-sm" title="None in your collection">
            New
          </span>
        )}
        {owned !== null && owned > 0 && (
          <span
            className="text-muted-foreground shrink-0 text-sm tabular-nums"
            title="Copies already in your collection"
          >
            {owned} owned
          </span>
        )}
        {price !== undefined && (
          <span className={cn("shrink-0 text-sm tabular-nums", priceColorClass(price))}>
            {formatValue(price)}
          </span>
        )}
      </div>
      {open && (
        <div id={actionsId} className="relative mt-2 flex flex-wrap items-center gap-2">
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
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              onClick={() => onRemoveOne(row)}
              aria-label={`Remove one ${name}`}
            >
              <MinusIcon />
            </Button>
            <span className="min-w-4 text-center tabular-nums">{count}</span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => onAddOne(row)}
              aria-label={`Add another ${name}`}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function SummaryHead({
  summary,
  formatValue,
  prefix,
  showNew,
}: {
  summary: ScanSessionSummaryData;
  formatValue: ((value?: number | null) => string) | null;
  prefix: string | null;
  showNew: boolean;
}) {
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      {prefix !== null && (
        <>
          <span className="font-medium">{prefix}</span>
          <span className="text-muted-foreground">·</span>
        </>
      )}
      <span className="font-medium tabular-nums">
        {summary.cards} {cardWord(summary.cards)}
      </span>
      {formatValue !== null && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium tabular-nums">{formatValue(summary.totalValue)}</span>
        </>
      )}
      {showNew && summary.newCards !== null && summary.newCards > 0 && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-success tabular-nums" title="Cards you own no copy of">
            {summary.newCards} new
          </span>
        </>
      )}
    </p>
  );
}

function SummaryFacts({
  summary,
  formatValue,
  showNew,
}: {
  summary: ScanSessionSummaryData;
  formatValue: ((value?: number | null) => string) | null;
  showNew: boolean;
}) {
  const facts: { key: string; node: ReactNode }[] = [];
  if (showNew && summary.newCards !== null && summary.newCards > 0) {
    facts.push({
      key: "new",
      node: (
        <span className="text-success tabular-nums" title="Cards you own no copy of">
          {summary.newCards} new
        </span>
      ),
    });
  }
  if (summary.wishedCards > 0) {
    facts.push({
      key: "wished",
      node: (
        <span className="text-destructive tabular-nums" title="Cards on your wishlists">
          {summary.wishedCards} wished
        </span>
      ),
    });
  }
  if (formatValue !== null && summary.unpricedCards > 0) {
    facts.push({
      key: "unpriced",
      node: (
        <span className="text-muted-foreground text-xs">
          {summary.unpricedCards} without price data
        </span>
      ),
    });
  }
  if (facts.length === 0) {
    return null;
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      {facts.map((fact, index) => (
        <span key={fact.key} className="flex items-baseline gap-2">
          {index > 0 && <span className="text-muted-foreground">·</span>}
          {fact.node}
        </span>
      ))}
    </p>
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
    <ul className="mb-2 flex flex-col gap-2">
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
