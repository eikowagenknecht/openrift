import type { Printing } from "@openrift/shared";
import { WellKnown, getOrientation, legendDisplayName } from "@openrift/shared";
import { ArrowLeftRightIcon, MinusIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { useId } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { CountPill } from "@/components/ui/count-pill";
import { Pressable } from "@/components/ui/pressable";
import type { UnidentifiedCard } from "@/hooks/use-card-scanner";
import { useEnumOrders } from "@/hooks/use-enums";
import { useScanTrayDisclosure } from "@/hooks/use-scan-tray-disclosure";
import { formatCardId } from "@/lib/format";
import type { ScanPrintingIndex } from "@/lib/scan-resolve";
import { finishSiblingsOf } from "@/lib/scan-resolve";
import { cn } from "@/lib/utils";
import type { ScanSessionRow } from "@/stores/scan-session-store";
import { useScanSessionStore } from "@/stores/scan-session-store";

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
  /**
   * Cards the scanner watched land in the guide and could not identify, since
   * the last card it did. Shown so a short count is something the user can see
   * and act on, rather than a silent shortfall they only notice later against
   * the physical pile.
   *
   * Deliberately not a session total: see `missedSinceNamed` in
   * use-card-scanner and `createPlacementTally`.
   */
  missedPlacements?: number;
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
  missedPlacements = 0,
  unidentified = [],
  onIdentifyMissed,
  onDismissMissed,
}: ScanSessionTrayProps) {
  const rows = useScanSessionStore((state) => state.rows);
  // Read once here, not per row: the hook rebuilds every enum's label map on
  // each call, and the camera pipeline wants that CPU.
  const { labels } = useEnumOrders();
  const newestFirst = [...rows.values()].toReversed();
  const { openId, toggle } = useScanTrayDisclosure(newestFirst.map((row) => row.printing.id));

  if (rows.size === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">
          Nothing scanned yet. Cards land in your collection the moment they are recognised, and
          show up here so you can undo or mark a foil.
        </p>
        <MissedLine count={missedPlacements} />
        <UnidentifiedList
          cards={unidentified}
          onIdentify={onIdentifyMissed}
          onDismiss={onDismissMissed}
        />
      </div>
    );
  }

  const total = newestFirst.reduce((sum, row) => sum + row.copyIds.length, 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        {total} {total === 1 ? "card" : "cards"} added this session
      </p>
      <MissedLine count={missedPlacements} />
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
          />
        ))}
      </ul>
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
}: TrayRowProps) {
  const actionsId = useId();
  const printing = row.printing;
  const name = legendDisplayName(printing.card);
  const isFoil = printing.finish !== WellKnown.finish.NORMAL;
  const copies = row.copyIds.length;

  return (
    <li className={cn("-mx-2 rounded-md px-2 py-2", open && "bg-muted/50")}>
      <Pressable
        className="flex w-full items-center gap-3 rounded-md"
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
            {copies > 1 && <CountPill className="shrink-0">×{copies}</CountPill>}
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <span className="font-mono">{formatCardId(printing)}</span>
            <PrintingVariantLabel printing={printing} siblings={siblings} />
          </span>
        </span>
      </Pressable>
      {open && (
        <div id={actionsId} className="mt-2 flex flex-wrap items-center gap-2">
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
        </div>
      )}
    </li>
  );
}

/**
 * The uncounted-placement line.
 *
 * A card the watcher saw land but nothing identified is the one failure the
 * scanner can detect but not fix, so it says so plainly and tells the user the
 * one thing that helps.
 *
 * It clears itself as soon as the scanner names another card, because by then
 * the advice has landed and the user has moved on. A running session total
 * would keep pointing at cards they can no longer pick out of the pile, and
 * rescanning one that was in fact counted adds it twice.
 *
 * @returns The line, or nothing when nothing has been missed lately.
 */
function MissedLine({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <p className="text-sm text-amber-600 dark:text-amber-500">
      {count} {count === 1 ? "card was" : "cards were"} not recognised. Scan{" "}
      {count === 1 ? "it" : "them"} again, more slowly.
    </p>
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
