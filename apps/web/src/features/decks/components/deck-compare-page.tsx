import { ZONE_LABELS } from "@openrift/shared/deck-zones";
import { imageUrl } from "@openrift/shared/image-url";
import type { DeckListItemResponse } from "@openrift/shared/types/api/deck";
import type { Card, Printing } from "@openrift/shared/types/catalog";
import { getOrientation } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardPasteIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { CommandEmpty, CommandGroup } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { Switch } from "@/components/ui/switch";
import { CardMiniRow } from "@/features/cards/components/card-mini-row";
import { useCards } from "@/features/cards/hooks/use-cards";
import { usePreferredPrinting } from "@/features/cards/hooks/use-preferred-printing";
import { EnergyGlyph, PowerPips } from "@/features/decks/components/deck-card-row";
import type { PastedCompareSource } from "@/features/decks/components/deck-compare-paste-dialog";
import { DeckComparePasteDialog } from "@/features/decks/components/deck-compare-paste-dialog";
import type { DeckIdentity } from "@/features/decks/components/deck-mini-identity";
import { DeckMiniIdentity } from "@/features/decks/components/deck-mini-identity";
import { DeckZoneHeader } from "@/features/decks/components/deck-zone-header";
import { HoveredCardPreview } from "@/features/decks/components/hovered-card-preview";
import { decksQueryOptions, deckDetailQueryOptions } from "@/features/decks/hooks/use-decks";
import type { OwnDeckCard } from "@/features/decks/lib/deck-compare-sources";
import {
  collectCompareDeckOptions,
  ownDeckDiffCards,
} from "@/features/decks/lib/deck-compare-sources";
import type { DeckDiffCard } from "@/features/decks/lib/deck-diff";
import type { SideBySideRow } from "@/features/decks/lib/deck-side-by-side";
import { alignDeckLists } from "@/features/decks/lib/deck-side-by-side";
import type { LocalDeck } from "@/features/decks/lib/local-deck";
import { isLocalDeckId } from "@/features/decks/lib/local-deck";
import { useLocalDecksStore } from "@/features/decks/stores/local-decks-store";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

/** Which column a picker fills. Doubles as the search-param name. */
type SideKey = "from" | "to";

const CELL_STYLES: Record<SideBySideRow["kind"], { from: string; to: string }> = {
  same: { from: "text-muted-foreground", to: "text-muted-foreground" },
  add: {
    from: "text-muted-foreground/60",
    to: "bg-success-soft text-success",
  },
  cut: { from: "bg-destructive-soft text-destructive", to: "text-muted-foreground/60" },
  change: {
    from: "bg-warning-soft text-warning",
    to: "bg-warning-soft text-warning",
  },
};

/** Both sides share the printing: the catalog's default, not either deck's pinned art. */
interface RowCatalog {
  card?: Card;
  printing?: Printing;
}

/** Everything the rows read from a hook, lifted to the page — see `CardMiniRow`. */
interface RowDisplay {
  domainColors: Record<string, string>;
  rarityLabels: Record<string, string>;
  domainLabels: Record<string, string>;
}

function SideCell({
  count,
  row,
  catalog,
  display,
  className,
}: {
  count: number;
  row: SideBySideRow;
  catalog: RowCatalog;
  display: RowDisplay;
  className: string;
}) {
  if (count === 0) {
    return <span className={cn("flex min-h-8 items-center px-2", className)}>—</span>;
  }
  const { card, printing } = catalog;
  return (
    <span
      className={cn("flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 sm:gap-2", className)}
    >
      <CardMiniRow
        className="self-stretch"
        imageId={printing?.images.find((image) => image.face === "front")?.imageId}
        landscape={card ? getOrientation(card.types) === "landscape" : false}
        domains={card?.domains}
        domainColors={display.domainColors}
        rarity={printing?.rarity}
        rarityLabels={display.rarityLabels}
        shortCode={printing?.shortCode}
        loading="lazy"
        hideMetaOnMobile
      />

      <span className="w-6 shrink-0 text-right tabular-nums">{count}×</span>

      <span className="min-w-0 flex-1 truncate">{row.cardName}</span>

      <PowerPips
        power={card?.power ?? null}
        domains={card?.domains ?? []}
        colors={display.domainColors}
        domainLabels={display.domainLabels}
      />

      {card?.energy !== null && card !== undefined && <EnergyGlyph value={card.energy} />}
    </span>
  );
}

function ChangesRow({
  row,
  catalog,
  display,
  onHover,
}: {
  row: SideBySideRow;
  catalog: RowCatalog;
  display: RowDisplay;
  onHover: (cardId: string | null) => void;
}) {
  const styles = CELL_STYLES[row.kind];
  return (
    <div
      className="hover:bg-muted/50 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md text-sm"
      onMouseEnter={() => onHover(row.cardId)}
      onMouseLeave={() => onHover(null)}
    >
      <SideCell
        count={row.from}
        row={row}
        catalog={catalog}
        display={display}
        className={styles.from}
      />
      <ArrowRightIcon
        aria-hidden
        className={cn(
          "size-3 shrink-0",
          row.kind === "same" ? "text-muted-foreground/30" : "text-muted-foreground",
        )}
      />
      <SideCell
        count={row.to}
        row={row}
        catalog={catalog}
        display={display}
        className={styles.to}
      />
    </div>
  );
}

function DeckPicker({
  label,
  value,
  identity,
  pastedText,
  familyIds,
  otherIds,
  identityById,
  onPick,
  onPaste,
  onClear,
}: {
  label: string;
  value: string | null;
  identity: DeckIdentity | null;
  pastedText: string | null;
  familyIds: string[];
  otherIds: string[];
  identityById: ReadonlyMap<string, DeckIdentity>;
  onPick: (deckId: string) => void;
  onPaste: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Reset per open, not once: picking changes `value` while this stays mounted.
  const [highlightedId, setHighlightedId] = useState("");
  const name = identity?.name ?? "Choose a deck";

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setHighlightedId(value ?? "");
    }
    setOpen(next);
  };

  const pick = (deckId: string) => {
    setOpen(false);
    onPick(deckId);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* A caption, not a form label: the control below is a menu button, which
          `<label for>` can't point at. */}
      <span className="text-sm leading-none font-medium">{label}</span>
      <div className="flex min-w-0 items-stretch gap-2">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger
            render={
              <Pressable
                aria-label={`${label}: ${name}`}
                className="bg-card ring-border hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-lg pr-2 ring-1 transition-colors"
              />
            }
          >
            {identity ? (
              <DeckMiniIdentity identity={identity} className="min-w-0 flex-1" />
            ) : (
              <span className="text-muted-foreground min-w-0 flex-1 truncate p-2 text-sm">
                {name}
              </span>
            )}
            <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-80 max-w-(--available-width) gap-0 p-0 sm:w-96"
          >
            <PickerList
              searchPlaceholder="Search your decks…"
              highlightedId={highlightedId}
              onHighlightChange={setHighlightedId}
            >
              <CommandEmpty>No decks match.</CommandEmpty>
              {familyIds.length > 0 && (
                <CommandGroup
                  className="p-0"
                  heading={familyIds.length > 1 ? "Versions of this deck" : undefined}
                >
                  {familyIds.map((deckId) => (
                    <DeckPickerRow
                      key={deckId}
                      deckId={deckId}
                      identityById={identityById}
                      selected={deckId === value}
                      onSelect={pick}
                    />
                  ))}
                </CommandGroup>
              )}
              {otherIds.length > 0 && (
                <CommandGroup
                  className="p-0 pt-2"
                  heading={familyIds.length > 0 ? "Your other decks" : "Your decks"}
                >
                  {otherIds.map((deckId) => (
                    <DeckPickerRow
                      key={deckId}
                      deckId={deckId}
                      identityById={identityById}
                      selected={deckId === value}
                      onSelect={pick}
                    />
                  ))}
                </CommandGroup>
              )}
            </PickerList>
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start font-normal"
                onClick={() => {
                  setOpen(false);
                  onPaste();
                }}
              >
                <ClipboardPasteIcon className="size-4" />
                Paste a deck code or list…
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {value !== null && (
          <Button
            variant="outline"
            className="self-center"
            render={
              <Link to="/decks/$deckId" params={{ deckId: value }} aria-label={`Open ${name}`} />
            }
          >
            Open
          </Button>
        )}
        {pastedText !== null && (
          <Button
            variant="outline"
            className="self-center"
            render={
              <Link
                to="/decks/import"
                search={{ code: pastedText }}
                aria-label="Save the pasted list as a deck"
              />
            }
          >
            Save
          </Button>
        )}
        {(value !== null || pastedText !== null) && (
          <Button
            variant="ghost"
            size="icon"
            className="self-center"
            aria-label={`Clear the ${label.toLowerCase()} deck`}
            onClick={onClear}
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** One deck's row in a picker list; null if the deck went away. */
function DeckPickerRow({
  deckId,
  identityById,
  selected,
  onSelect,
}: {
  deckId: string;
  identityById: ReadonlyMap<string, DeckIdentity>;
  selected: boolean;
  onSelect: (deckId: string) => void;
}) {
  const identity = identityById.get(deckId);
  if (!identity) {
    return null;
  }
  return (
    <PickerRow
      value={deckId}
      keywords={[identity.name]}
      onSelect={() => onSelect(deckId)}
      className="gap-0 p-0 pr-2"
    >
      <DeckMiniIdentity identity={identity} className="min-w-0 flex-1 rounded-md" />
      <CheckIcon className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
    </PickerRow>
  );
}

function countCopies(cards: readonly OwnDeckCard[]): number {
  return cards.reduce((total, card) => total + card.quantity, 0);
}

function serverIdentity(item: DeckListItemResponse): DeckIdentity {
  return {
    name: item.deck.name,
    legendCardId: item.legendCardId,
    championCardId: item.championCardId,
    cardCount: item.totalCards,
    updatedAt: item.deck.updatedAt,
  };
}

/** The list endpoint's legend and champion ids have no local equivalent, so these come off the deck's own rows. */
function localIdentity(deck: LocalDeck): DeckIdentity {
  return {
    name: deck.name,
    legendCardId: deck.cards.find((card) => card.zone === WellKnown.deckZone.LEGEND)?.cardId,
    championCardId: deck.cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION)?.cardId,
    cardCount: countCopies(deck.cards),
    updatedAt: deck.updatedAt,
  };
}

/** A `local:` id resolves from the browser store; a server id goes through the deck-detail query, already warmed by the route for the ids it opened with. */
function useSideRows(deckId: string | null, userId: string | null): readonly OwnDeckCard[] | null {
  const localDecks = useLocalDecksStore((state) => state.decks);
  const isLocal = deckId !== null && isLocalDeckId(deckId);
  const { data } = useQuery({
    ...deckDetailQueryOptions(userId ?? "", deckId ?? ""),
    enabled: deckId !== null && !isLocal && userId !== null,
  });
  if (deckId === null) {
    return null;
  }
  if (isLocal) {
    return localDecks[deckId]?.cards ?? null;
  }
  return data?.cards ?? null;
}

export function DeckComparePage({ fromId, toId }: { fromId?: string; toId?: string }) {
  const [changesOnly, setChangesOnly] = useState(true);
  const [pastedFrom, setPastedFrom] = useState<PastedCompareSource | null>(null);
  const [pastedTo, setPastedTo] = useState<PastedCompareSource | null>(null);
  const [pasteFor, setPasteFor] = useState<SideKey | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const userId = useUserId();
  const { cardsById } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const { labels } = useEnumOrders();
  const domainColors = useDomainColors();
  const localDecks = useLocalDecksStore((state) => state.decks);
  const { data: serverDecks } = useQuery({
    ...decksQueryOptions(userId ?? ""),
    enabled: userId !== null,
  });

  const display: RowDisplay = {
    domainColors,
    rarityLabels: labels.rarities,
    domainLabels: labels.domains,
  };

  const items = serverDecks ?? [];
  const identityById = new Map<string, DeckIdentity>();
  for (const item of items) {
    identityById.set(item.deck.id, serverIdentity(item));
  }
  for (const deck of Object.values(localDecks)) {
    identityById.set(deck.id, localIdentity(deck));
  }

  const anchorId = toId ?? fromId ?? null;
  const anchorFamilyId = items.find((item) => item.deck.id === anchorId)?.deck.familyId ?? null;
  const familyIds =
    anchorFamilyId === null
      ? anchorId !== null && identityById.has(anchorId)
        ? [anchorId]
        : []
      : items
          .filter((item) => item.deck.familyId === anchorFamilyId)
          .toSorted((left, right) => right.deck.updatedAt.localeCompare(left.deck.updatedAt))
          .map((item) => item.deck.id);
  const familySet = new Set(familyIds);
  const otherIds = collectCompareDeckOptions(anchorId ?? "", items, localDecks)
    .filter((option) => !familySet.has(option.id))
    .map((option) => option.id);

  const fromDeckId = pastedFrom ? null : (fromId ?? null);
  const toDeckId = pastedTo ? null : (toId ?? null);
  const fromRows = useSideRows(fromDeckId, userId);
  const toRows = useSideRows(toDeckId, userId);

  const fromCards: DeckDiffCard[] | null = pastedFrom
    ? pastedFrom.cards
    : fromRows
      ? ownDeckDiffCards(fromRows, cardsById).theirs
      : null;
  const toCards: DeckDiffCard[] | null = pastedTo
    ? pastedTo.cards
    : toRows
      ? ownDeckDiffCards(toRows, cardsById).theirs
      : null;

  const pastedIdentity = (pasted: PastedCompareSource): DeckIdentity => ({
    name: "Pasted list",
    legendCardId: pasted.cards.find((card) => card.zone === WellKnown.deckZone.LEGEND)?.cardId,
    championCardId: pasted.cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION)?.cardId,
    cardCount: countCopies(pasted.cards),
  });
  const fromIdentity = pastedFrom
    ? pastedIdentity(pastedFrom)
    : (identityById.get(fromDeckId ?? "") ?? null);
  const toIdentity = pastedTo
    ? pastedIdentity(pastedTo)
    : (identityById.get(toDeckId ?? "") ?? null);

  const zones = fromCards && toCards ? alignDeckLists(fromCards, toCards) : [];
  const rows = zones.flatMap((zone) => zone.rows);
  const sharedCount = rows.reduce((total, row) => total + Math.min(row.from, row.to), 0);
  const bothChosen =
    (fromDeckId !== null || pastedFrom !== null) && (toDeckId !== null || pastedTo !== null);
  const bothPicked = fromCards !== null && toCards !== null;
  const isIdentical = bothPicked && rows.every((row) => row.kind === "same");
  const unmatched = [...(pastedFrom?.unmatched ?? []), ...(pastedTo?.unmatched ?? [])];

  const handlePick = (side: SideKey, pickedId: string) => {
    if (side === "from") {
      setPastedFrom(null);
    } else {
      setPastedTo(null);
    }
    void navigate({
      to: "/decks/compare",
      search: {
        from: side === "from" ? pickedId : (fromDeckId ?? undefined),
        to: side === "to" ? pickedId : (toDeckId ?? undefined),
      },
    });
  };

  const handleClear = (side: SideKey) => {
    if (side === "from") {
      setPastedFrom(null);
    } else {
      setPastedTo(null);
    }
    void navigate({
      to: "/decks/compare",
      search: {
        from: side === "from" ? undefined : (fromDeckId ?? undefined),
        to: side === "to" ? undefined : (toDeckId ?? undefined),
      },
      replace: true,
    });
  };

  const handlePasted = (source: PastedCompareSource) => {
    if (pasteFor === "from") {
      setPastedFrom(source);
    } else {
      setPastedTo(source);
    }
    // The pasted side leaves the URL: it can't be linked to, and a stale id
    // there would come back the moment the other side changes.
    void navigate({
      to: "/decks/compare",
      search: {
        from: pasteFor === "from" ? undefined : (fromDeckId ?? undefined),
        to: pasteFor === "to" ? undefined : (toDeckId ?? undefined),
      },
      replace: true,
    });
  };

  const hoveredPrinting =
    hoveredCardId !== null && !isMobile ? (getPreferredPrinting(hoveredCardId) ?? null) : null;
  const hoveredImage = hoveredPrinting?.images.find((image) => image.face === "front") ?? null;
  const hoveredCard =
    hoveredPrinting && hoveredImage
      ? {
          thumbnailUrl: imageUrl(hoveredImage.imageId, "400w"),
          fullUrl: imageUrl(hoveredImage.imageId, "full"),
          landscape: getOrientation(hoveredPrinting.card.types) === "landscape",
        }
      : null;

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          {anchorId === null ? (
            <PageTopBarBack to="/decks" aria-label="Back to your decks" />
          ) : (
            <PageTopBarBack
              to="/decks/$deckId"
              params={{ deckId: anchorId }}
              aria-label="Back to the deck"
            />
          )}
          <PageTopBarTitle>Compare</PageTopBarTitle>
          <PageTopBarActions>
            <Switch id="deck-changes-only" checked={changesOnly} onCheckedChange={setChangesOnly} />
            <Label htmlFor="deck-changes-only" className="font-normal">
              Only what changed
            </Label>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div ref={containerRef} className="relative">
        <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING_NO_TOP, "flex flex-col gap-5 pt-3")}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-2">
            <DeckPicker
              label="From"
              value={fromDeckId}
              identity={fromIdentity}
              pastedText={pastedFrom?.text ?? null}
              familyIds={familyIds}
              otherIds={otherIds}
              identityById={identityById}
              onPick={(picked) => handlePick("from", picked)}
              onPaste={() => setPasteFor("from")}
              onClear={() => handleClear("from")}
            />
            <span className="hidden items-center justify-center self-stretch pt-6 sm:flex">
              <ArrowRightIcon aria-hidden className="text-muted-foreground size-3 shrink-0" />
            </span>
            <DeckPicker
              label="To"
              value={toDeckId}
              identity={toIdentity}
              pastedText={pastedTo?.text ?? null}
              familyIds={familyIds}
              otherIds={otherIds}
              identityById={identityById}
              onPick={(picked) => handlePick("to", picked)}
              onPaste={() => setPasteFor("to")}
              onClear={() => handleClear("to")}
            />
          </div>

          {bothPicked && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {sharedCount} {sharedCount === 1 ? "card is" : "cards are"} the same
            </p>
          )}

          {!bothChosen && (
            <p className="text-muted-foreground">
              Pick a deck on each side, or paste a deck code or list, and the comparison shows what
              was cut, what was added, and what both share, zone by zone. Handy for tracking a
              deck&apos;s versions or sizing up a build against a tournament list.
            </p>
          )}
          {isIdentical && <p className="text-sm">The two lists match, card for card.</p>}

          {unmatched.length > 0 && (
            <div className="text-muted-foreground flex flex-col gap-1">
              <p className="text-sm">
                Couldn&apos;t match {unmatched.length} {unmatched.length === 1 ? "line" : "lines"}{" "}
                of the pasted list
              </p>
              <ul className="text-2xs flex flex-col gap-0.5">
                {unmatched.map((line, index) => (
                  // Duplicate raw lines are possible, so the index is part of the key.
                  <li key={`${line}-${index}`} className="truncate">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-5">
            {zones.map((zone) => {
              const zoneRows = changesOnly
                ? zone.rows.filter((row) => row.kind !== "same")
                : zone.rows;
              if (zoneRows.length === 0) {
                return null;
              }
              return (
                <section key={zone.zone} className="flex min-w-0 flex-col gap-1">
                  <DeckZoneHeader label={ZONE_LABELS[zone.zone]} />
                  {zoneRows.map((row) => (
                    <ChangesRow
                      key={`${zone.zone}-${row.cardId}`}
                      row={row}
                      catalog={{
                        card: cardsById[row.cardId],
                        printing: getPreferredPrinting(row.cardId),
                      }}
                      display={display}
                      onHover={setHoveredCardId}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </div>

        <HoveredCardPreview hoveredCard={hoveredCard} origin="main" containerRef={containerRef} />
      </div>

      <DeckComparePasteDialog
        open={pasteFor !== null}
        onOpenChange={(open) => setPasteFor(open ? pasteFor : null)}
        onResolved={handlePasted}
      />
    </>
  );
}
