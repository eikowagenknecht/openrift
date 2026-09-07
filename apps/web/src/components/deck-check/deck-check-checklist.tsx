import type { DeckCheckEntryCardResponse, Printing } from "@openrift/shared";
import {
  WellKnown,
  getOrientation,
  imageUrl,
  legendDisplayName,
  setIndexById,
  UNKNOWN_SET_INDEX,
} from "@openrift/shared";
import { CheckIcon, LayoutGridIcon, PencilIcon, Rows3Icon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CardCell } from "@/components/cards/card-cell";
import { CardStrip, StripIconButton } from "@/components/cards/card-strip";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { FixCardDialog } from "@/components/deck-check/deck-check-entry-dialogs";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { Button } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { SectionHeading } from "@/components/ui/section-heading";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders, useZoneOrder } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  useRemoveTournamentDeckCheckCard,
  useTickTournamentDeckCheckCard,
} from "@/hooks/use-tournament-deck-check";
import type { DeckCheckSort } from "@/lib/deck-check-sort";
import { sortDeckCheckCards } from "@/lib/deck-check-sort";
import { cn } from "@/lib/utils";
import type { DeckCheckDisplayMode } from "@/stores/deck-check-view-store";

interface HoveredPreview {
  thumbnailUrl: string;
  fullUrl: string;
  landscape: boolean;
}

export const CHECK_GRID_GAP = 12;
export const CHECK_CELL_WIDTH = 172;

export function CardChecklist({
  tournamentId,
  entryId,
  cards,
  displayMode,
  sortBy,
  sortDir,
  columns,
  cellWidth,
  locked,
  fixLocked,
  fixZoneOnly,
  tickLocked,
  onStale,
}: {
  tournamentId: string;
  entryId: string;
  cards: DeckCheckEntryCardResponse[];
  displayMode: DeckCheckDisplayMode;
  sortBy: DeckCheckSort;
  sortDir: "asc" | "desc";
  columns: number;
  cellWidth: number;
  locked: boolean;
  fixLocked: boolean;
  fixZoneOnly: boolean;
  tickLocked: boolean;
  onStale: () => void;
}) {
  const { zoneLabels } = useZoneOrder();
  const { orders } = useEnumOrders();
  const { allPrintings, sets } = useCards();
  const isMobile = useIsMobile();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoveredPreview | null>(null);

  const printingById = new Map(allPrintings.map((printing) => [printing.id, printing]));
  const setIndexes = setIndexById(sets);
  const identify = (printingId: string | null) => {
    const printing = printingId ? printingById.get(printingId) : undefined;
    return printing
      ? {
          name: legendDisplayName(printing.card),
          shortCode: printing.shortCode,
          setIndex: setIndexes.get(printing.setId) ?? UNKNOWN_SET_INDEX,
          domains: printing.card.domains,
          energy: printing.card.energy,
          power: printing.card.power,
        }
      : undefined;
  };

  const handleHover = (printing: Printing | null) => {
    const front = printing?.images.find((image) => image.face === "front");
    setHovered(
      printing && front
        ? {
            thumbnailUrl: imageUrl(front.imageId, "400w"),
            fullUrl: imageUrl(front.imageId, "full"),
            landscape: getOrientation(printing.card.types) === "landscape",
          }
        : null,
    );
  };

  const cardsByZone = Map.groupBy(cards, (card) => card.zone);
  const zoneCards = (zone: DeckCheckEntryCardResponse["zone"]) =>
    sortDeckCheckCards(cardsByZone.get(zone) ?? [], sortBy, sortDir, identify, orders.domains);

  const flowZones = (
    [
      WellKnown.deckZone.LEGEND,
      WellKnown.deckZone.CHAMPION,
      WellKnown.deckZone.BATTLEFIELD,
    ] as const
  ).filter((zone) => cardsByZone.has(zone));
  const stackedZones = (
    [
      WellKnown.deckZone.MAIN,
      WellKnown.deckZone.SIDEBOARD,
      WellKnown.deckZone.OVERFLOW,
      WellKnown.deckZone.RUNES,
    ] as const
  ).filter((zone) => cardsByZone.has(zone));

  if (displayMode === "list") {
    const orderedZones = [...flowZones, ...stackedZones];
    return (
      <div ref={previewContainerRef} className="relative flex flex-col gap-6">
        <HoveredCardPreview
          hoveredCard={isMobile ? null : hovered}
          origin="main"
          containerRef={previewContainerRef}
        />
        {orderedZones.map((zone) => (
          <ZoneSection
            key={zone}
            tournamentId={tournamentId}
            entryId={entryId}
            label={zoneLabels[zone]}
            cards={zoneCards(zone)}
            displayMode="list"
            printingById={printingById}
            onHover={handleHover}
            columns={columns}
            cellWidth={cellWidth}
            locked={locked}
            fixLocked={fixLocked}
            fixZoneOnly={fixZoneOnly}
            tickLocked={tickLocked}
            onStale={onStale}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {flowZones.length > 0 ? (
        <div className="flex flex-wrap gap-x-10 gap-y-6">
          {flowZones.map((zone) => (
            <ZoneSection
              key={zone}
              tournamentId={tournamentId}
              entryId={entryId}
              label={zoneLabels[zone]}
              cards={zoneCards(zone)}
              displayMode="grid"
              columns={columns}
              cellWidth={cellWidth}
              intrinsic
              locked={locked}
              fixLocked={fixLocked}
              fixZoneOnly={fixZoneOnly}
              tickLocked={tickLocked}
              onStale={onStale}
            />
          ))}
        </div>
      ) : null}
      {stackedZones.map((zone) => (
        <ZoneSection
          key={zone}
          tournamentId={tournamentId}
          entryId={entryId}
          label={zoneLabels[zone]}
          cards={zoneCards(zone)}
          displayMode="grid"
          columns={columns}
          cellWidth={cellWidth}
          locked={locked}
          fixLocked={fixLocked}
          fixZoneOnly={fixZoneOnly}
          tickLocked={tickLocked}
          onStale={onStale}
        />
      ))}
    </div>
  );
}

const ACTIVE_TOGGLE_CLASS =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

export function DisplayModeToggle({
  mode,
  onModeChange,
}: {
  mode: DeckCheckDisplayMode;
  onModeChange: (mode: DeckCheckDisplayMode) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Display mode"
      variant="outline"
      spacing={0}
      value={[mode]}
      onValueChange={([next]) => {
        if (next === "grid" || next === "list") {
          onModeChange(next);
        }
      }}
    >
      <ToggleGroupItem
        value="grid"
        className={ACTIVE_TOGGLE_CLASS}
        title="Grid view"
        aria-label="Grid view"
      >
        <LayoutGridIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="list"
        className={ACTIVE_TOGGLE_CLASS}
        title="List view"
        aria-label="List view"
      >
        <Rows3Icon className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function ZoneSection({
  tournamentId,
  entryId,
  label,
  cards,
  displayMode,
  printingById,
  onHover,
  columns,
  cellWidth,
  intrinsic,
  locked,
  fixLocked,
  fixZoneOnly,
  tickLocked,
  onStale,
}: {
  tournamentId: string;
  entryId: string;
  label: string;
  cards: DeckCheckEntryCardResponse[];
  displayMode: DeckCheckDisplayMode;
  printingById?: Map<string, Printing>;
  onHover?: (printing: Printing | null) => void;
  columns: number;
  cellWidth: number;
  intrinsic?: boolean;
  locked: boolean;
  fixLocked: boolean;
  fixZoneOnly: boolean;
  tickLocked: boolean;
  onStale: () => void;
}) {
  const verifiedCopies = cards.reduce(
    (sum, card) => sum + card.foundCopies.filter(Boolean).length,
    0,
  );
  const totalCopies = cards.reduce((sum, card) => sum + card.quantity, 0);
  const done = totalCopies > 0 && verifiedCopies === totalCopies;

  const heading = (
    <SectionHeading as="h3" className={cn("flex items-center gap-1.5", done && "text-success")}>
      <span>{label}</span>
      <span>
        · {verifiedCopies}/{totalCopies}
      </span>
      {done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
    </SectionHeading>
  );

  if (displayMode === "list") {
    return (
      <section className="flex min-w-0 flex-col gap-1.5">
        {heading}
        <div className="flex flex-col">
          {cards.flatMap((card) =>
            Array.from({ length: card.quantity }, (_copy, copyIndex) => (
              <ChecklistRow
                key={`${card.id}:${copyIndex}`}
                tournamentId={tournamentId}
                entryId={entryId}
                card={card}
                copyIndex={copyIndex}
                printing={
                  card.resolvedPrintingId ? printingById?.get(card.resolvedPrintingId) : undefined
                }
                onHover={onHover}
                locked={locked}
                fixLocked={fixLocked}
                fixZoneOnly={fixZoneOnly}
                tickLocked={tickLocked}
                onStale={onStale}
              />
            )),
          )}
        </div>
      </section>
    );
  }

  const intrinsicWidth = totalCopies * cellWidth + (totalCopies - 1) * CHECK_GRID_GAP;
  const gridTemplateColumns = intrinsic
    ? `repeat(auto-fill, minmax(min(${cellWidth}px, 100%), 1fr))`
    : `repeat(${columns}, minmax(0, 1fr))`;
  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      style={intrinsic ? { width: `min(100%, ${intrinsicWidth}px)` } : undefined}
    >
      {heading}
      <div className="grid gap-3" style={{ gridTemplateColumns }}>
        {cards.flatMap((card) =>
          Array.from({ length: card.quantity }, (_copy, copyIndex) => (
            <ChecklistCell
              key={`${card.id}:${copyIndex}`}
              tournamentId={tournamentId}
              entryId={entryId}
              card={card}
              copyIndex={copyIndex}
              cellWidth={cellWidth}
              locked={locked}
              fixLocked={fixLocked}
              fixZoneOnly={fixZoneOnly}
              tickLocked={tickLocked}
              onStale={onStale}
            />
          )),
        )}
      </div>
    </section>
  );
}

function ChecklistRow({
  tournamentId,
  entryId,
  card,
  copyIndex,
  printing,
  onHover,
  locked,
  fixLocked,
  fixZoneOnly,
  tickLocked,
  onStale,
}: {
  tournamentId: string;
  entryId: string;
  card: DeckCheckEntryCardResponse;
  copyIndex: number;
  printing?: Printing;
  onHover?: (printing: Printing | null) => void;
  locked: boolean;
  fixLocked: boolean;
  fixZoneOnly: boolean;
  tickLocked: boolean;
  onStale: () => void;
}) {
  const tickCard = useTickTournamentDeckCheckCard();
  const removeCard = useRemoveTournamentDeckCheckCard();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const found = card.foundCopies[copyIndex] === true;
  const matched = printing !== undefined && card.matchStatus === "matched";
  const name = matched ? legendDisplayName(printing.card) : card.rawName;

  const toggle = async () => {
    if (tickLocked) {
      return;
    }
    try {
      await tickCard.mutateAsync({
        tournamentId,
        entryId,
        cardId: card.id,
        copyIndex,
        found: !found,
      });
    } catch {
      toast.info("This list changed, reloading now");
      onStale();
    }
  };

  const handleRemove = async () => {
    try {
      await removeCard.mutateAsync({ tournamentId, entryId, cardId: card.id, copyIndex });
      setRemoveOpen(false);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  };

  return (
    <div
      className="hover:bg-muted/50 flex items-center gap-2 rounded-md"
      onMouseEnter={() => {
        if (matched) {
          onHover?.(printing);
        }
      }}
      onMouseLeave={() => onHover?.(null)}
    >
      <Pressable
        onClick={() => void toggle()}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md border",
            found ? "border-success bg-success text-success-foreground" : "border-input",
          )}
        >
          {found ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
        </span>
        {matched ? (
          <span className="text-muted-foreground w-24 shrink-0 text-sm tabular-nums">
            {printing.shortCode}
          </span>
        ) : null}
        <span
          className={cn("min-w-0 flex-1 truncate", found && "text-muted-foreground line-through")}
        >
          {name}
        </span>
        {matched ? null : (
          <span className="text-muted-foreground shrink-0 text-sm">
            {card.matchStatus === "ambiguous" ? "Several matches" : "Not in catalog"}
          </span>
        )}
        {card.quantity > 1 ? (
          <span className="text-muted-foreground text-2xs shrink-0">copy {copyIndex + 1}</span>
        ) : null}
      </Pressable>
      {fixLocked && locked ? null : (
        <div className="flex shrink-0 items-center gap-0.5 pr-1">
          {fixLocked ? null : (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={fixZoneOnly ? `Move ${name}` : `Fix ${name}`}
                className="text-muted-foreground"
                onClick={() => setFixOpen(true)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <FixCardDialog
                tournamentId={tournamentId}
                entryId={entryId}
                card={card}
                open={fixOpen}
                onOpenChange={setFixOpen}
                zoneOnly={fixZoneOnly}
              />
            </>
          )}
          {locked ? null : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove this copy of ${card.rawName}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setRemoveOpen(true)}
            >
              <XIcon className="size-3.5" />
            </Button>
          )}
        </div>
      )}
      <ConfirmActionDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${card.rawName}?`}
        description={
          card.quantity > 1
            ? "Only this copy is removed from the list."
            : "The card is removed from this list."
        }
        confirmLabel="Remove"
        pendingLabel="Removing..."
        isPending={removeCard.isPending}
        onConfirm={() => void handleRemove()}
      />
    </div>
  );
}

function ChecklistCell({
  tournamentId,
  entryId,
  card,
  copyIndex,
  cellWidth,
  locked,
  fixLocked,
  fixZoneOnly,
  tickLocked,
  onStale,
}: {
  tournamentId: string;
  entryId: string;
  card: DeckCheckEntryCardResponse;
  copyIndex: number;
  cellWidth: number;
  locked: boolean;
  fixLocked: boolean;
  fixZoneOnly: boolean;
  tickLocked: boolean;
  onStale: () => void;
}) {
  const { allPrintings } = useCards();
  const display = useCardThumbnailDisplay();
  const tickCard = useTickTournamentDeckCheckCard();
  const removeCard = useRemoveTournamentDeckCheckCard();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const found = card.foundCopies[copyIndex] === true;

  const toggle = async () => {
    if (tickLocked) {
      return;
    }
    try {
      await tickCard.mutateAsync({
        tournamentId,
        entryId,
        cardId: card.id,
        copyIndex,
        found: !found,
      });
    } catch {
      // A 409 means the list was re-imported under us; reload the entry.
      toast.info("This list changed, reloading now");
      onStale();
    }
  };

  const handleRemove = async () => {
    try {
      await removeCard.mutateAsync({ tournamentId, entryId, cardId: card.id, copyIndex });
      setRemoveOpen(false);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  };

  const foundOverlay = found ? (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="bg-background/80 rounded-full p-3 shadow-md">
        <CheckIcon className="text-success size-12" strokeWidth={3} />
      </div>
    </div>
  ) : null;

  const actionStrip =
    fixLocked && locked ? null : (
      <>
        <CardStrip
          right={
            <>
              {fixLocked ? null : (
                <StripIconButton
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={fixZoneOnly ? `Move ${card.rawName}` : `Fix ${card.rawName}`}
                  onClick={() => setFixOpen(true)}
                >
                  <PencilIcon />
                </StripIconButton>
              )}
              {locked ? null : (
                <StripIconButton
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove this copy of ${card.rawName}`}
                  onClick={() => setRemoveOpen(true)}
                >
                  <XIcon />
                </StripIconButton>
              )}
            </>
          }
        />
        {fixLocked ? null : (
          <FixCardDialog
            tournamentId={tournamentId}
            entryId={entryId}
            card={card}
            open={fixOpen}
            onOpenChange={setFixOpen}
            zoneOnly={fixZoneOnly}
          />
        )}
        {locked ? null : (
          <ConfirmActionDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            title={`Remove ${card.rawName}?`}
            description={
              card.quantity > 1
                ? "Only this copy is removed from the list."
                : "The card is removed from this list."
            }
            confirmLabel="Remove"
            pendingLabel="Removing..."
            isPending={removeCard.isPending}
            onConfirm={() => void handleRemove()}
          />
        )}
      </>
    );

  const printing = card.resolvedPrintingId
    ? allPrintings.find((candidate) => candidate.id === card.resolvedPrintingId)
    : undefined;

  if (!printing || card.matchStatus !== "matched") {
    return (
      <div>
        {actionStrip}
        <div className="relative">
          <Pressable
            onClick={() => void toggle()}
            className={cn(
              "border-warning/40 bg-warning-soft flex h-full w-full flex-col items-start gap-1 rounded-md border border-dashed p-2 text-sm",
              found && "opacity-60",
            )}
          >
            <span className="font-medium break-all">{card.rawName}</span>
            <span className="text-muted-foreground">
              {card.matchStatus === "ambiguous" ? "Several matches" : "Not in catalog"}
            </span>
          </Pressable>
          {foundOverlay}
        </div>
      </div>
    );
  }

  return (
    <CardCell
      printing={printing}
      ctx={{ isSelected: false, isFlashing: false, cardWidth: cellWidth, priority: false }}
      display={display}
      showImages
      onClick={() => void toggle()}
      strip={actionStrip}
      leftOverlay={foundOverlay}
      dimmed={found}
    />
  );
}
